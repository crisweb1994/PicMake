/** 页面级编排：生成、错误反馈（toast）及历史/表单/编辑之间的页面转换。 */
import { useRef, useState } from "react";
import type { HistoryRow } from "../db/schema";
import { db } from "../db/schema";
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
  onDraftReady,
}: {
  history: ReturnType<typeof useHistory>;
  form: ReturnType<typeof useForm>;
  onViewReset: () => void;
  /** 编辑此图 / 复用参数把草稿落位后回调：页面据此展开创作条并聚焦（PRD §5.1/§5.2） */
  onDraftReady: () => void;
}) {
  const settings = useSettings();
  const { selectedId, selectedRow, display, pendingSave } = history;
  const [returnId, setReturnId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  /** 底栏 complete 态的数据源：最近一次保存成功的结果（chipbar §5.2） */
  const [lastDone, setLastDone] = useState<HistoryRow | null>(null);
  const generation = useGeneration();
  const clearDone = () => setLastDone(null);

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
      setLastDone(prepared.row);
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
    originPrompt?: string,
  ) => {
    const prepared = prepareGeneration(
      paramsForRun,
      run.result,
      run.edit,
      run.startedAt,
      undefined,
      originPrompt,
    );
    await savePrepared(prepared);
  };

  /** 编辑/参考生成时取首个输入源记录的原始描述（沿链路取最初那条；PRD 2026-09-23） */
  const resolveOriginPrompt = async (
    inputs: Array<{ generationId?: string }>,
  ): Promise<string | undefined> => {
    const sourceId = inputs.find((input) => input.generationId)?.generationId;
    if (!sourceId) return undefined;
    const source = await db.history.get(sourceId);
    return source ? (source.originPrompt ?? source.prompt) : undefined;
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
      const originPrompt = draft
        ? await resolveOriginPrompt(draft.inputs)
        : undefined;
      const run = await generation.start(paramsForRun, draft, config);
      await handleRunResult(paramsForRun, run, originPrompt);
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
    setLastDone(null);
    const params = form.getParams();
    if (params)
      void startGeneration(
        params,
        form.inputs.length
          ? { inputs: form.inputs, inputFidelity: form.inputFidelity }
          : null,
      );
  };

  /** 「再来一版」：用历史记录的参数与输入源直接重发一次（chipbar complete 态） */
  const regenerate = (row: HistoryRow) => {
    if (generation.phase === "generating" || savingRef.current || pendingSave)
      return;
    setLastDone(null);
    const draft: EditDraft | null = row.inputSources?.length
      ? {
          inputs: row.inputSources.map((source) => ({
            imageId: source.imageId,
            generationId: source.generationId,
          })),
          inputFidelity: row.inputFidelity ?? "auto",
        }
      : null;
    void startGeneration({ ...row.params }, draft);
  };

  const selectHistory = (row: HistoryRow) => {
    if (generation.phase === "generating" || savingRef.current) return;
    confirmPendingLeave(() => {
      clearDone();
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
      clearDone();
      generation.reset();
      form.initialize(row.params);
      history.select(null);
      setReturnId(null);
      onViewReset();
      onDraftReady();
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
    clearDone();
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
    onDraftReady();
  };

  const returnToResult = () => {
    if (generation.phase === "generating" || savingRef.current || !returnId)
      return;
    confirmPendingLeave(() => {
      clearDone();
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
      clearDone();
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
              clearDone();
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
    regenerate,
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
    lastDone,
    clearDone,
  };
}
