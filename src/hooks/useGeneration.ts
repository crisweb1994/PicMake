import { useCallback, useEffect, useRef, useState } from "react";
import { generateImageEditStream, generateImageStream } from "../api/client";
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

export function useGeneration(onFallback?: () => void) {
  const [phase, setPhase] = useState<"idle" | "generating">("idle");
  const [partial, setPartial] = useState<{ url: string; index: number } | null>(
    null,
  );
  const activeRef = useRef<{ id: number; abort: AbortController } | null>(null);
  const nextIdRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);
  const snapshotRef = useRef<RequestSnapshot | null>(null);

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
      clearPreview();
      const startedAt = Date.now();

      try {
        let edit = snapshot.edit;
        if (snapshot.draft && !edit) {
          const source = await db.images.get(snapshot.draft.source.imageId);
          abort.signal.throwIfAborted();
          if (!source)
            throw new ApiError(
              "source-unavailable",
              ERROR_HINTS["source-unavailable"],
            );
          edit = {
            ...snapshot.draft,
            params: snapshot.params,
            sourceBlob: source.blob,
            sourceFormat: source.format,
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
          onFallback,
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
    [clearPreview, onFallback],
  );

  const start = useCallback(
    (params: GenParams, draft: EditDraft | null, config: ApiConfig) => {
      const snapshot: RequestSnapshot = { params, draft, config };
      snapshotRef.current = snapshot;
      return execute(snapshot);
    },
    [execute],
  );

  const retryRequest = useCallback(() => {
    const snapshot = snapshotRef.current;
    if (!snapshot) return Promise.resolve(null);
    return execute(snapshot);
  }, [execute]);

  const cancel = useCallback(() => {
    activeRef.current?.abort.abort();
  }, []);

  const reset = useCallback(() => {
    activeRef.current?.abort.abort();
    snapshotRef.current = null;
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
    start,
    retryRequest,
    cancel,
    reset,
  };
}

export { isAbortError };
