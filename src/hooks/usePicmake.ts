/** 页面级编排：生成、错误反馈（toast）及历史/表单/编辑之间的页面转换。 */
import { useRef, useState } from "react";
import type { HistoryRow } from "../db/schema";
import {
  useGeneration,
  isAbortError,
  type GenerationRun,
} from "./useGeneration";
import type { useHistory } from "./useHistory";
import type { useForm } from "./useForm";
import { prepareGeneration, type PreparedGeneration } from "../lib/generation";
import {
  ApiError,
  ERROR_HINTS,
  ERROR_TITLES,
  type ApiConfig,
  type EditDraft,
  type GenParams,
} from "../lib/types";
import type { ConfirmState } from "../lib/view-models";
import { useSettings } from "../store/settings";
import { toast } from "@heroui/react";

/** 错误反馈统一走 toast（PRD FR-8，2026-09-22）：标题 + 建议或原始信息 */
function toastError(error: unknown) {
  const kind = error instanceof ApiError ? error.kind : "unknown";
  const detail =
    error instanceof ApiError && error.message
      ? error.message
      : ERROR_HINTS[kind];
  toast(`${ERROR_TITLES[kind]}：${detail}`);
}

export function usePicmake({
  history,
  form,
  onViewReset,
}: {
  history: ReturnType<typeof useHistory>;
  form: ReturnType<typeof useForm>;
  onViewReset: () => void;
}) {
  const settings = useSettings();
  const { selectedId, selectedRow, display, pendingSave } = history;
  const [returnId, setReturnId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const generation = useGeneration();

  const confirmPendingLeave = (onLeave: () => void) => {
    if (!pendingSave) {
      if (form.dirty && !display) {
        setConfirmState({
          title: "放弃当前草稿？",
          desc: "未提交的图片、描述和参数修改将被放弃。",
          onOk: onLeave,
        });
      } else onLeave();
      return;
    }
    setConfirmState({
      title: "放弃未保存结果？",
      desc: "图片已经生成，但尚未保存到本机。离开后这次结果会丢失。",
      onOk: () => {
        history.discardPending();
        onLeave();
      },
    });
  };

  const savePrepared = async (
    prepared: PreparedGeneration,
  ): Promise<boolean> => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    try {
      await history.save(prepared);
      form.initialize();
      setReturnId(null);
      generation.reset();
      toast("生成完成");
      return true;
    } catch {
      toast(`${ERROR_TITLES["save-failed"]}：${ERROR_HINTS["save-failed"]}`);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
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
    history.select(null);
    onViewReset();
    const config: ApiConfig = {
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
    };
    try {
      const run = await generation.start(paramsForRun, draft, config);
      await handleRunResult(paramsForRun, run);
    } catch (caught) {
      if (isAbortError(caught)) {
        toast("已取消生成");
        return;
      }
      toastError(caught);
    }
  };

  const generate = () => {
    if (
      generation.phase === "generating" ||
      savingRef.current ||
      form.reading ||
      confirmState ||
      pendingSave
    )
      return;
    const params = form.getParams();
    if (params)
      void startGeneration(
        params,
        form.inputs.length
          ? { inputs: form.inputs, inputFidelity: form.inputFidelity }
          : null,
      );
  };

  const selectHistory = (row: HistoryRow) => {
    if (generation.phase === "generating" || savingRef.current) return;
    confirmPendingLeave(() => {
      generation.reset();
      history.select(row.id);
      form.initialize();
      setReturnId(null);
      onViewReset();
    });
  };

  const reuseParams = (row: HistoryRow) => {
    if (generation.phase === "generating" || savingRef.current) return;
    confirmPendingLeave(() => {
      generation.reset();
      form.initialize(row.params);
      history.select(null);
      setReturnId(null);
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
    form.initialize({ ...selectedRow.params, prompt: "" }, [
      {
        generationId: selectedRow.id,
        imageId,
        name: `已有作品 · 第 ${selectedRow.imageIds.indexOf(imageId) + 1} 张`,
      },
    ]);
    setReturnId(selectedRow.id);
    history.select(null);
    onViewReset();
    generation.reset();
  };

  const returnToResult = () => {
    if (generation.phase === "generating" || savingRef.current || !returnId)
      return;
    confirmPendingLeave(() => {
      generation.reset();
      form.initialize();
      history.select(returnId);
      setReturnId(null);
      onViewReset();
    });
  };

  const newGeneration = () => {
    if (generation.phase === "generating" || savingRef.current) return;
    confirmPendingLeave(() => {
      generation.reset();
      history.select(null);
      form.initialize();
      setReturnId(null);
      onViewReset();
    });
  };

  const deleteGen = (row: HistoryRow) => {
    if (generation.phase === "generating" || savingRef.current || pendingSave)
      return;
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
              form.initialize();
              setReturnId(null);
              onViewReset();
            }
          })
          .catch((caught) => toastError(caught));
      },
    });
  };

  return {
    phase: generation.phase,
    partial: generation.partial,
    plan: generation.plan,
    generate,
    cancelGenerate: generation.cancel,
    selectHistory,
    deleteGen,
    reuseParams,
    editImage,
    returnToResult,
    canReturn: !!returnId && history.rows.some((row) => row.id === returnId),
    saving,
    newGeneration,
    confirmState,
    setConfirmState,
    settings,
  };
}
