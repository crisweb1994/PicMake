import { useCallback, useEffect, useRef, useState } from "react";
import { requestImages } from "../api/client";
import { db } from "../db/schema";
import { b64ToBlob } from "../lib/blob";
import { MASK_MAX_BYTES, validateMaskDocument } from "../lib/inpaint";
import {
  ApiError,
  ERROR_HINTS,
  INPAINT_ISSUE_HINTS,
  MAX_INPUT_BYTES,
  MAX_INPUT_IMAGES,
  type ApiConfig,
  type EditDraft,
  type EditSubmission,
  type GenParams,
  type ImageRequestResult,
} from "../lib/types";
import type { GenPlan } from "../lib/view-models";

export interface GenerationRun {
  result: ImageRequestResult;
  edit?: EditSubmission;
  startedAt: number;
}

interface RequestSnapshot {
  params: GenParams;
  draft: EditDraft | null;
  config: ApiConfig;
}

/** 由草稿构建 mask 提交快照；校验失败则不发送（IP-11）。 */
function buildInpaintSubmission(
  draft: NonNullable<EditDraft["inpaint"]>,
  base: {
    source: { imageId: string };
    image: { width: number; height: number };
  },
): {
  maskImage: NonNullable<EditSubmission["inpaint"]>["maskImage"];
  original?: NonNullable<EditSubmission["inpaint"]>["original"];
} {
  const { mask, original } = draft;
  const validated = validateMaskDocument(mask.mask, base.source.imageId, {
    width: base.image.width,
    height: base.image.height,
  });
  if ("issue" in validated)
    throw new Error(INPAINT_ISSUE_HINTS[validated.issue]);
  if (!mask.blob.size || mask.blob.size >= MASK_MAX_BYTES)
    throw new Error(INPAINT_ISSUE_HINTS["mask-too-large"]);
  return {
    maskImage: { ...mask, mask: validated.doc },
    ...(original
      ? { original: { source: { ...original.source }, image: original.image } }
      : {}),
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function useGeneration() {
  const [phase, setPhase] = useState<"idle" | "generating">("idle");
  const [partial, setPartial] = useState<{ url: string; index: number } | null>(
    null,
  );
  const [plan, setPlan] = useState<GenPlan | null>(null);
  /** 单飞锁：请求进行中阻止再次 start；取消经 AbortController 失效迟到回调 */
  const activeRef = useRef<AbortController | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPartial(null);
  }, []);

  const execute = useCallback(
    async (snapshot: RequestSnapshot): Promise<GenerationRun> => {
      if (activeRef.current) throw new Error("generation already running");
      const abort = new AbortController();
      activeRef.current = abort;
      setPhase("generating");
      setPlan({ n: snapshot.params.n, size: snapshot.params.size });
      clearPreview();
      const startedAt = Date.now();

      try {
        let edit: EditSubmission | undefined;
        if (snapshot.draft) {
          if (snapshot.draft.inputs.length > MAX_INPUT_IMAGES)
            throw new ApiError(
              "too-many-images",
              ERROR_HINTS["too-many-images"],
            );
          const sources = await Promise.all(
            snapshot.draft.inputs.map(async (input, index) => {
              const image =
                input.upload ?? (await db.images.get(input.imageId));
              if (!image)
                throw new ApiError(
                  "source-unavailable",
                  `图${index + 1}：${ERROR_HINTS["source-unavailable"]}`,
                );
              if (!image.blob.size || image.blob.size >= MAX_INPUT_BYTES)
                throw new ApiError(
                  "image-too-large",
                  `图${index + 1}：${ERROR_HINTS["image-too-large"]}`,
                );
              const { upload: _upload, ...source } = input;
              return { source, image };
            }),
          );
          abort.signal.throwIfAborted();
          edit = {
            sources,
            params: snapshot.params,
            inputFidelity: snapshot.draft.inputFidelity,
            ...(snapshot.draft.inpaint
              ? {
                  inpaint: buildInpaintSubmission(
                    snapshot.draft.inpaint,
                    sources[0],
                  ),
                }
              : {}),
          };
        }

        const handlers = {
          signal: abort.signal,
          onPartial: (b64: string, index: number) => {
            if (previewUrlRef.current)
              URL.revokeObjectURL(previewUrlRef.current);
            const url = URL.createObjectURL(b64ToBlob(b64));
            previewUrlRef.current = url;
            setPartial({ url, index });
          },
        };
        const result = await requestImages(
          snapshot.params,
          snapshot.config,
          handlers,
          edit,
        );
        abort.signal.throwIfAborted();
        return { result, edit, startedAt };
      } finally {
        activeRef.current = null;
        clearPreview();
        setPhase("idle");
      }
    },
    [clearPreview],
  );

  const start = useCallback(
    (params: GenParams, draft: EditDraft | null, config: ApiConfig) =>
      execute({
        params,
        // 快照隔离（SKETCH §8.4 / TECH §3.2）：提交后草稿再变化不影响本次请求
        draft: draft ? structuredClone(draft) : null,
        config: { ...config },
      }),
    [execute],
  );

  const cancel = useCallback(() => {
    activeRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    activeRef.current?.abort();
    setPlan(null);
    clearPreview();
  }, [clearPreview]);

  useEffect(
    () => () => {
      activeRef.current?.abort();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  return {
    phase,
    partial,
    plan,
    start,
    cancel,
    reset,
  };
}

export { isAbortError };
