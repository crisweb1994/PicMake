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
import {
  prepareGeneration,
  type PreparedGeneration,
  type ResultMeta,
} from "../lib/generation";
import { b64ToBlob, decodeImageMeta } from "../lib/blob";
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
  /** 完整工作流锁（TECH §9.1）：从第一个 await 前同步锁住资源准备→请求→解码→保存，
   *  双击提交与各入口共用同一把锁；取消经 token 失效迟到回调。 */
  const workflowBusyRef = useRef(false);

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
    // 逐张解码实际元信息（TECH §10.1）：格式与宽高以结果字节为准，不用请求参数伪装
    const metas: ResultMeta[] = [];
    for (const image of run.result.images) {
      const meta = await decodeImageMeta(b64ToBlob(image.b64));
      metas.push(
        meta ?? { width: 0, height: 0, format: paramsForRun.outputFormat },
      );
    }
    const prepared = prepareGeneration(
      paramsForRun,
      run.result,
      run.edit,
      run.startedAt,
      undefined,
      originPrompt,
      metas,
    );
    await savePrepared(prepared);
  };

  /** 编辑/参考生成时取首个输入源记录的原始描述（沿链路取最初那条；PRD 2026-09-23）。
   *  局部重绘分支 inputs[0] 恒为实际底图（TECH §9.2），不会误取参考图来源。 */
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
    } finally {
      workflowBusyRef.current = false;
    }
  };

  const generate = () => {
    if (
      generation.phase === "generating" ||
      savingRef.current ||
      workflowBusyRef.current ||
      form.reading ||
      confirmState ||
      pendingSave
    )
      return;
    // 尺寸接受复核（IP-10）：目标尺寸未接受时不发生成请求
    if (
      form.inpaint &&
      form.inpaintInfo?.suggested &&
      !form.inpaintInfo.accepted
    ) {
      toast("输出尺寸与原图不同，请先接受建议尺寸");
      return;
    }
    setLastDone(null);
    const params = form.getParams();
    if (params)
      void startGeneration(
        params,
        form.inputs.length
          ? {
              inputs: form.inputs,
              inputFidelity: form.inputFidelity,
              ...(form.inpaint ? { inpaint: form.inpaint } : {}),
            }
          : null,
      );
  };

  /** 读取局部重绘记录的完整资源（IP-16/A31）：实际底图、参考图、mask；
   *  原文件缺失可省略并提示，其余缺失则阻断该动作。 */
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
    // 目标尺寸按当前约束复核：约束变化须重新接受（IP-10/§7）
    const target = inpaintTargetSize(baseRow.width, baseRow.height);
    if (!target) return { ok: false, missing: "底图" };
    const params: GenParams = {
      ...row.params,
      size: { w: target.w, h: target.h },
    };
    return { ok: true, draft, mask: maskRow as MaskImage, params };
  };

  /** 「调整上次重绘」（IP-16）：恢复底图、参考图、选区与描述参数为可编辑草稿，不生成 */
  const adjustInpaint = (row: HistoryRow) => {
    if (generation.phase === "generating" || savingRef.current || pendingSave)
      return;
    confirmPendingLeave(async () => {
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
        unchanged: true,
      });
      form.acceptSize();
      history.select(null);
      setReturnId(null);
      onViewReset();
      onDraftReady();
      toast("已恢复上次重绘，可继续调整后生成");
    });
  };

  /** 「再来一版」（IP-16）：局部重绘记录复用同一请求底图与 mask 直接提交 */
  const regenerateInpaint = async (row: HistoryRow) => {
    const read = await readInpaintDraft(row);
    if (!read.ok) {
      toast(`${read.missing}不可用，无法再来一版`);
      return;
    }
    if (
      row.params.size === "auto" ||
      row.params.size.w !== (read.params.size as { w: number }).w ||
      row.params.size.h !== (read.params.size as { w: number; h: number }).h
    ) {
      toast("输出尺寸约束已变化，请用「调整上次重绘」确认新尺寸");
      return;
    }
    await startGeneration(read.params, read.draft);
  };

  /** 「再来一版」：用历史记录的参数与输入源直接重发一次（chipbar complete 态） */
  const regenerate = (row: HistoryRow) => {
    if (generation.phase === "generating" || savingRef.current || pendingSave)
      return;
    setLastDone(null);
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
    confirmState,
    setConfirmState,
    settings,
    lastDone,
    clearDone,
    confirmPendingLeave,
  };
}
