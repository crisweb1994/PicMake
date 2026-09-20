/** 页面级编排：生成、错误恢复及历史/表单/编辑之间的页面转换。 */
import { useCallback, useState } from "react";
import { testConnection } from "../api/client";
import type { HistoryRow } from "../db/schema";
import {
  useGeneration,
  isAbortError,
  type GenerationRun,
} from "./useGeneration";
import type { useHistory } from "./useHistory";
import type { useForm } from "./useForm";
import type { useEdit } from "./useEdit";
import { prepareGeneration, type PreparedGeneration } from "../lib/generation";
import {
  ApiError,
  ERROR_HINTS,
  ERROR_TITLES,
  type ApiConfig,
  type EditDraft,
  type GenParams,
} from "../lib/types";
import type { ConfirmState, ErrorState } from "../lib/view-models";
import { useSettings } from "../store/settings";
import { toast } from "@heroui/react";

function toErrorState(error: unknown): ErrorState {
  if (error instanceof ApiError) {
    return {
      kind: error.kind,
      title: ERROR_TITLES[error.kind],
      message: error.message || ERROR_HINTS[error.kind],
    };
  }
  return {
    kind: "unknown",
    title: ERROR_TITLES.unknown,
    message: ERROR_HINTS.unknown,
  };
}

export function usePicmake({
  history,
  form,
  edit,
  onViewReset,
  onEditGenerationStart,
}: {
  history: ReturnType<typeof useHistory>;
  form: ReturnType<typeof useForm>;
  edit: ReturnType<typeof useEdit>;
  onViewReset: () => void;
  onEditGenerationStart: () => void;
}) {
  const settings = useSettings();
  const { selectedId, selectedRow, display, pendingSave } = history;
  const { editDraft } = edit;
  const [error, setError] = useState<ErrorState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const onFallback = useCallback(() => {
    toast("已自动切换为普通请求，本次无渐进预览");
  }, []);
  const generation = useGeneration(onFallback);

  const confirmPendingLeave = (onLeave: () => void) => {
    if (!pendingSave) {
      onLeave();
      return;
    }
    setConfirmState({
      title: "放弃未保存结果？",
      desc: "图片已经生成，但尚未保存到本机。离开后这次结果会丢失。",
      onOk: () => {
        history.discardPending();
        setError(null);
        onLeave();
      },
    });
  };

  const savePrepared = async (
    prepared: PreparedGeneration,
  ): Promise<boolean> => {
    try {
      await history.save(prepared);
      generation.reset();
      setError(null);
      toast("生成完成");
      return true;
    } catch {
      setError({
        kind: "save-failed",
        title: ERROR_TITLES["save-failed"],
        message: ERROR_HINTS["save-failed"],
      });
      return false;
    }
  };

  const handleRunResult = async (
    paramsForRun: GenParams,
    run: GenerationRun,
  ) => {
    const prepared = prepareGeneration(
      paramsForRun,
      run.result,
      run.edit,
      run.startedAt,
    );
    await savePrepared(prepared);
  };

  const startGeneration = async (
    paramsForRun: GenParams,
    draft: EditDraft | null,
  ) => {
    setError(null);
    if (!draft) {
      history.select(null);
      onViewReset();
    } else {
      onEditGenerationStart();
    }
    const config: ApiConfig = {
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
    };
    try {
      const run = await generation.start(
        paramsForRun,
        draft ? { ...draft, source: { ...draft.source } } : null,
        config,
      );
      await handleRunResult(paramsForRun, run);
    } catch (caught) {
      if (isAbortError(caught)) {
        toast("已取消生成");
        return;
      }
      setError(toErrorState(caught));
    }
  };

  const generate = () => {
    if (generation.phase === "generating" || confirmState || pendingSave)
      return;
    const params = form.getParams();
    if (params) void startGeneration(params, editDraft);
  };

  const retry = () => {
    setError(null);
    if (pendingSave) {
      void savePrepared(pendingSave);
      return;
    }
    void generation
      .retryRequest()
      .then((run) => {
        if (run) void handleRunResult(run.params, run);
      })
      .catch((caught) => {
        if (isAbortError(caught)) return;
        setError(toErrorState(caught));
      });
  };

  const discardPending = () => {
    history.discardPending();
    setError(null);
    onViewReset();
    history.select(null);
    toast("已放弃未保存结果");
  };

  const selectHistory = (row: HistoryRow) => {
    if (generation.phase === "generating") return;
    confirmPendingLeave(() => {
      generation.reset();
      history.select(row.id);
      edit.close();
      setError(null);
      onViewReset();
    });
  };

  const reuseParams = (row: HistoryRow) => {
    if (generation.phase === "generating") return;
    confirmPendingLeave(() => {
      generation.reset();
      form.fill(row.params);
      history.select(null);
      edit.close();
      setError(null);
      onViewReset();
      toast("参数已回填，可直接生成");
    });
  };

  const editImage = (imageId: string) => {
    if (
      generation.phase === "generating" ||
      pendingSave ||
      !display ||
      !selectedRow
    )
      return;
    if (!display.images.some((image) => image.id === imageId)) return;
    form.fill(selectedRow.params);
    edit.start({ generationId: selectedRow.id, imageId });
    onViewReset();
    setError(null);
    generation.reset();
  };

  const closeEdit = () => {
    generation.reset();
    edit.close();
    setError(null);
  };

  const newGeneration = () => {
    if (generation.phase === "generating") return;
    confirmPendingLeave(() => {
      generation.reset();
      history.select(null);
      edit.close();
      setError(null);
      onViewReset();
    });
  };

  const deleteGen = (row: HistoryRow) => {
    if (generation.phase === "generating" || pendingSave) return;
    setConfirmState({
      title: "删除这次生成？",
      desc: `包含 ${row.imageIds.length} 张图片，删除后无法恢复。`,
      onOk: () => {
        void history
          .remove(row.id)
          .then(() => {
            toast("已删除");
            if (selectedId === row.id) {
              generation.reset();
              edit.close();
              setError(null);
              onViewReset();
            }
          })
          .catch((caught) => setError(toErrorState(caught)));
      },
    });
  };

  const runTestConnection = async (baseUrl: string, apiKey: string) => {
    const result = await testConnection({ baseUrl, apiKey });
    return result.ok
      ? result
      : { ok: false as const, message: ERROR_HINTS[result.error.kind] };
  };

  const goEditPrompt = () => {
    setError(null);
    if (!editDraft) newGeneration();
    form.focus();
  };

  return {
    phase: generation.phase,
    partial: generation.partial,
    generate,
    cancelGenerate: generation.cancel,
    selectHistory,
    deleteGen,
    reuseParams,
    editImage,
    closeEdit,
    newGeneration,
    error,
    retry,
    discardPending,
    goEditPrompt,
    confirmState,
    setConfirmState,
    settings,
    runTestConnection,
  };
}
