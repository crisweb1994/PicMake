/** 页面级编排：生成、错误反馈（toast）及历史/表单/编辑之间的页面转换。 */
import { useRef, useState } from "react";
import type { HistoryRow } from "../db/schema";
import { db } from "../db/schema";
import { useGeneration, isAbortError } from "./useGeneration";
import type { useHistory } from "./useHistory";
import type { useForm } from "./useForm";
import { prepareGeneration, type PreparedGeneration } from "../lib/generation";
import { inpaintTargetSize } from "../lib/inpaint";
import {
  ApiError,
  ERROR_HINTS,
  ERROR_TITLES,
  type ApiConfig,
  type EditDraft,
  type GenParams,
  type InputImage,
  type MaskImage,
} from "../lib/types";
import {
  hasUserWork,
  leaveDecision,
  type RunPhase,
} from "../lib/workspace-rules";
import { useSettings } from "../store/settings";
import { useWorkspace } from "../store/workspace";
import {
  clearDone,
  openBar,
  resetView,
  setConfirm,
  setLastDoneId,
  setReturnId,
} from "../store/workspace/actions";
import { toast } from "@heroui/react";

/** 错误反馈统一走 toast：标题 + 建议或原始信息 */
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
}: {
  history: ReturnType<typeof useHistory>;
  form: ReturnType<typeof useForm>;
}) {
  const { selectedId, display, pendingSave } = history;
  const returnId = useWorkspace((s) => s.nav.returnId);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const generation = useGeneration();
  /** 完整工作流锁：第一个 await 前同步锁住资源准备→请求→解码→保存 */
  const workflowBusyRef = useRef(false);

  /** 当前生成阶段（事件里调用，含 ref）：准备期（锁已占、请求未发）也算 generating */
  const currentRunPhase = (): RunPhase => {
    if (savingRef.current) return "saving";
    if (workflowBusyRef.current || generation.phase === "generating")
      return "generating";
    return pendingSave ? "unsaved" : "idle";
  };

  /** 离开或替换当前结果/草稿：规则见 leaveDecision；usesDisplayed = 以展示中的记录为来源 */
  const requestLeave = (onLeave: () => void, usesDisplayed = false) => {
    const decision = leaveDecision({
      run: currentRunPhase(),
      userWork: hasUserWork({ dirty: form.dirty, reading: form.reading }),
      usesDisplayed,
    });
    if (decision === "blocked") return;
    if (decision === "confirm-unsaved") {
      setConfirm({
        title: "放弃未保存结果？",
        desc: "图片已经生成，但尚未保存到本机。离开后这次结果会丢失。",
        onOk: () => {
          history.discardPending();
          onLeave();
        },
      });
      return;
    }
    if (decision === "confirm-draft") {
      setConfirm({
        title: "放弃当前草稿？",
        desc: "未提交的修改将被放弃。",
        onOk: onLeave,
      });
      return;
    }
    onLeave();
  };

  const savePrepared = async (prepared: PreparedGeneration): Promise<void> => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await history.save(prepared);
      form.initialize();
      setReturnId(null);
      generation.reset();
      setLastDoneId(prepared.row.id);
      toast("生成完成");
    } catch {
      toast(`${ERROR_TITLES["save-failed"]}：${ERROR_HINTS["save-failed"]}`);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  /** 取首个输入源的原始描述（沿链路取最初；局部重绘 inputs[0] 恒为底图） */
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
    if (workflowBusyRef.current) return;
    workflowBusyRef.current = true;
    history.select(null);
    resetView();
    // 配置在发请求时读一次，不订阅 settings
    const { baseUrl, apiKey } = useSettings.getState();
    const config: ApiConfig = { baseUrl, apiKey };
    try {
      const originPrompt = draft
        ? await resolveOriginPrompt(draft.inputs)
        : undefined;
      const run = await generation.start(paramsForRun, draft, config);
      const prepared = prepareGeneration(
        paramsForRun,
        run.result,
        run.edit,
        run.startedAt,
        undefined,
        originPrompt,
      );
      await savePrepared(prepared);
    } catch (caught) {
      if (isAbortError(caught)) {
        toast("已取消生成");
        return;
      }
      toastError(caught);
    } finally {
      workflowBusyRef.current = false;
    }
  };

  const generate = () => {
    // 生成中底栏已切到 GenBar，此处只需拦保存期与工作流窗口期的重复触发
    if (savingRef.current || workflowBusyRef.current || pendingSave) return;
    const checked = form.checkParams();
    // 目标尺寸未接受时不发生成请求
    if (!checked.ok && checked.reason === "size-not-accepted") {
      if (checked.message) toast(checked.message);
      return;
    }
    setLastDoneId(null);
    if (!checked.ok) {
      if (checked.message) toast(checked.message);
      if (checked.focusPrompt) form.focus();
      return;
    }
    void startGeneration(
      checked.params,
      form.inputs.length
        ? {
            inputs: form.inputs,
            inputFidelity: form.inputFidelity,
            ...(form.inpaint ? { inpaint: form.inpaint } : {}),
          }
        : null,
    );
  };

  /** 读取局部重绘记录资源：底图、参考图、mask；原文件缺失可省略，其余阻断 */
  const readInpaintDraft = async (
    row: HistoryRow,
  ): Promise<
    | { ok: true; draft: EditDraft; mask: MaskImage; params: GenParams }
    | { ok: false; missing: string }
  > => {
    const inp = row.inpaint;
    const sources = row.inputSources ?? [];
    if (!inp || !sources.length) return { ok: false, missing: "选区" };
    const maskRow = await db.images.get(inp.maskImageId);
    if (!maskRow?.mask) return { ok: false, missing: "选区" };
    const baseRow = await db.images.get(maskRow.mask.baseImageId);
    if (!baseRow) return { ok: false, missing: "底图" };
    const inputs: InputImage[] = [
      {
        imageId: baseRow.id,
        generationId: sources[0]?.generationId,
        name: sources[0]?.name ?? "底图",
        upload: baseRow,
      },
    ];
    for (const source of sources.slice(1)) {
      if (source.imageId === baseRow.id) continue;
      const image = await db.images.get(source.imageId);
      if (!image)
        return {
          ok: false,
          missing: source.name ? `参考图「${source.name}」` : "参考图",
        };
      inputs.push({
        imageId: source.imageId,
        generationId: source.generationId,
        name: source.name,
        upload: image,
      });
    }
    const draft: EditDraft = {
      inputs,
      inputFidelity: row.inputFidelity ?? "auto",
      inpaint: { mask: maskRow as MaskImage },
    };
    // 目标尺寸按当前约束复核
    const target = inpaintTargetSize(baseRow.width, baseRow.height);
    if (!target) return { ok: false, missing: "底图" };
    const params: GenParams = {
      ...row.params,
      size: { w: target.w, h: target.h },
    };
    return { ok: true, draft, mask: maskRow as MaskImage, params };
  };

  /** 调整上次重绘：恢复为可编辑草稿，不生成 */
  const adjustInpaint = (row: HistoryRow) => {
    requestLeave(async () => {
      clearDone();
      generation.reset();
      const read = await readInpaintDraft(row);
      if (!read.ok) {
        toast(`${read.missing}不可用，无法恢复上次重绘`);
        return;
      }
      // 恢复为已确认草稿：接受状态沿用已保存目标（约束变化在生成前重新复核）
      form.initialize(read.params, read.draft.inputs);
      form.applyInpaint({
        base: read.draft.inputs[0].upload!,
        mask: read.mask,
        original: read.draft.inpaint?.original,
        entry: "reedit",
      });
      form.acceptSize();
      history.select(null);
      setReturnId(null);
      resetView();
      openBar();
      toast("已恢复上次重绘，可继续调整后生成");
    }, true);
  };

  /** 再来一版：局部重绘记录复用同一底图与 mask 直接提交（尺寸按当前约束重算，恒合法） */
  const regenerateInpaint = async (row: HistoryRow) => {
    const read = await readInpaintDraft(row);
    if (!read.ok) {
      toast(`${read.missing}不可用，无法再来一版`);
      return;
    }
    await startGeneration(read.params, read.draft);
  };

  /** 再来一版：用历史记录的参数与输入源直接重发（仅 complete 态底栏可达） */
  const regenerate = (row: HistoryRow) => {
    setLastDoneId(null);
    if (row.inpaint) {
      void regenerateInpaint(row);
      return;
    }
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

  /** 各入口共用的清理：complete 态、生成态、草稿、返回标记与查看状态（历史选择由各入口自理） */
  const resetWorkspace = () => {
    clearDone();
    generation.reset();
    form.initialize();
    setReturnId(null);
    resetView();
  };

  const selectHistory = (row: HistoryRow) => {
    requestLeave(() => {
      history.select(row.id);
      resetWorkspace();
    });
  };

  const reuseParams = (row: HistoryRow) => {
    requestLeave(() => {
      clearDone();
      generation.reset();
      form.initialize(row.params);
      history.select(null);
      setReturnId(null);
      resetView();
      openBar();
      toast("参数已回填，可直接生成");
    });
  };

  const editImage = (imageId: string) => {
    if (!display) return;
    // 请求时确定来源记录：确认框之后执行时不再重新推断
    const row = display.row;
    requestLeave(() => {
      clearDone();
      form.initialize({ ...row.params, prompt: "" }, [
        {
          generationId: row.id,
          imageId,
          name: `已有作品 · 第 ${row.imageIds.indexOf(imageId) + 1} 张`,
        },
      ]);
      setReturnId(row.id);
      history.select(null);
      resetView();
      generation.reset();
      openBar();
    }, true);
  };

  const returnToResult = () => {
    if (!returnId) return;
    requestLeave(() => {
      history.select(returnId);
      resetWorkspace();
    });
  };

  const newGeneration = () => {
    requestLeave(() => {
      history.select(null);
      resetWorkspace();
    });
  };

  const deleteGen = (row: HistoryRow) => {
    if (currentRunPhase() !== "idle") return;
    setConfirm({
      title: "删除这次生成？",
      desc: `包含 ${row.imageIds.length} 张图片，删除后无法恢复。`,
      onOk: () => {
        void history
          .remove(row.id)
          .then(() => {
            toast("已删除");
            if (selectedId === row.id) resetWorkspace();
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
    adjustInpaint,
    cancelGenerate: generation.cancel,
    selectHistory,
    deleteGen,
    reuseParams,
    editImage,
    returnToResult,
    canReturn: !!returnId && history.rows.some((row) => row.id === returnId),
    saving,
    newGeneration,
    currentRunPhase,
    requestLeave,
  };
}
