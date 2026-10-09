import { useEffect, useRef, useState } from "react";
import { requestImages } from "../api/client";
import { db } from "../db/schema";
import { b64ToBlob } from "../lib/blob";
import {
  ApiError,
  ERROR_HINTS,
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

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function useGeneration() {
  const [phase, setPhase] = useState<"idle" | "generating">("idle");
  const [partial, setPartial] = useState<{ url: string; index: number } | null>(
    null,
  );
  const [plan, setPlan] = useState<GenPlan | null>(null);
  /** 单飞锁：请求进行中阻止再次 start */
  const activeRef = useRef<AbortController | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const clearPreview = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPartial(null);
  };

  const start = async (
    params: GenParams,
    draft: EditDraft | null,
    config: ApiConfig,
  ): Promise<GenerationRun> => {
    if (activeRef.current) throw new Error("generation already running");
    const abort = new AbortController();
    activeRef.current = abort;
    setPhase("generating");
    setPlan({ n: params.n, size: params.size });
    clearPreview();
    const startedAt = Date.now();

    try {
      let edit: EditSubmission | undefined;
      if (draft) {
        // 来源可能来自历史，读取失败（已被删除）是唯一需要拦截的情形
        const sources = await Promise.all(
          draft.inputs.map(async (input, index) => {
            const image = input.upload ?? (await db.images.get(input.imageId));
            if (!image)
              throw new ApiError(
                "source-unavailable",
                `图${index + 1}：${ERROR_HINTS["source-unavailable"]}`,
              );
            const { upload: _upload, ...source } = input;
            return { source, image };
          }),
        );
        abort.signal.throwIfAborted();
        const inpaint = draft.inpaint;
        edit = {
          sources,
          inputFidelity: draft.inputFidelity,
          ...(inpaint
            ? {
                inpaint: {
                  maskImage: inpaint.mask,
                  ...(inpaint.original
                    ? {
                        original: {
                          source: { ...inpaint.original.source },
                          image: inpaint.original.image,
                        },
                      }
                    : {}),
                },
              }
            : {}),
        };
      }

      const handlers = {
        signal: abort.signal,
        onPartial: (b64: string, index: number) => {
          if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
          const url = URL.createObjectURL(b64ToBlob(b64));
          previewUrlRef.current = url;
          setPartial({ url, index });
        },
      };
      const result = await requestImages(params, config, handlers, edit);
      abort.signal.throwIfAborted();
      return { result, edit, startedAt };
    } finally {
      activeRef.current = null;
      clearPreview();
      setPhase("idle");
    }
  };

  const cancel = () => {
    activeRef.current?.abort();
  };

  const reset = () => {
    activeRef.current?.abort();
    setPlan(null);
    clearPreview();
  };

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
