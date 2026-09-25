import { useCallback, useEffect, useRef, useState } from "react";
import { generateImageEditStream, generateImageStream } from "../api/client";
import { db } from "../db/schema";
import { b64ToBlob } from "../lib/blob";
import { cloneSketchDocument } from "../lib/sketch";
import {
  ApiError,
  ERROR_HINTS,
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
  params: GenParams;
  edit?: EditSubmission;
  startedAt: number;
}

interface RequestSnapshot {
  params: GenParams;
  draft: EditDraft | null;
  config: ApiConfig;
  edit?: EditSubmission;
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
  const activeRef = useRef<{ id: number; abort: AbortController } | null>(null);
  const nextIdRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPartial(null);
  }, []);

  const execute = useCallback(
    async (snapshot: RequestSnapshot): Promise<GenerationRun> => {
      if (activeRef.current) throw new Error("generation already running");
      const id = ++nextIdRef.current;
      const abort = new AbortController();
      activeRef.current = { id, abort };
      setPhase("generating");
      setPlan({ n: snapshot.params.n, size: snapshot.params.size });
      clearPreview();
      const startedAt = Date.now();

      try {
        let edit = snapshot.edit;
        if (snapshot.draft && !edit) {
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
          };
          snapshot.edit = edit;
        }

        const handlers = {
          signal: abort.signal,
          onPartial: (b64: string, index: number) => {
            if (activeRef.current?.id !== id) return;
            if (previewUrlRef.current)
              URL.revokeObjectURL(previewUrlRef.current);
            const url = URL.createObjectURL(b64ToBlob(b64));
            previewUrlRef.current = url;
            setPartial({ url, index });
          },
        };
        const result = edit
          ? await generateImageEditStream(edit, snapshot.config, handlers)
          : await generateImageStream(
              snapshot.params,
              snapshot.config,
              handlers,
            );
        abort.signal.throwIfAborted();
        return { result, params: snapshot.params, edit, startedAt };
      } finally {
        if (activeRef.current?.id === id) activeRef.current = null;
        clearPreview();
        setPhase("idle");
      }
    },
    [clearPreview],
  );

  const start = useCallback(
    (params: GenParams, draft: EditDraft | null, config: ApiConfig) => {
      const snapshot: RequestSnapshot = {
        params: {
          ...params,
          size: params.size === "auto" ? "auto" : { ...params.size },
        },
        // 草图附件带嵌套命令文档：快照深拷贝文档，提交后的可恢复笔画不会与
        // 后续编辑分叉（SKETCH §8.4——文档不可原地修改，修改走新 ImageRow）
        draft: draft
          ? {
              ...draft,
              inputs: draft.inputs.map((input) =>
                input.upload?.sketch
                  ? {
                      ...input,
                      upload: {
                        ...input.upload,
                        sketch: cloneSketchDocument(input.upload.sketch),
                      },
                    }
                  : { ...input },
              ),
            }
          : null,
        config: { ...config },
      };
      return execute(snapshot);
    },
    [execute],
  );

  const cancel = useCallback(() => {
    activeRef.current?.abort.abort();
  }, []);

  const reset = useCallback(() => {
    activeRef.current?.abort.abort();
    setPlan(null);
    clearPreview();
  }, [clearPreview]);

  useEffect(
    () => () => {
      activeRef.current?.abort.abort();
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
