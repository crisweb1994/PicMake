/** 生成流程：草稿校验、请求、partial 预览、写库与各种结束方式；状态只经迁移函数写入 */
import { toast } from "@heroui/react";
import { requestImages } from "../api/client";
import { db, type HistoryRow } from "../db/schema";
import { saveGeneration } from "../db/history";
import { b64ToBlob } from "../lib/blob";
import { prepareGeneration } from "../lib/generation";
import { inpaintTargetSize } from "../lib/inpaint";
import {
  ApiError,
  ERROR_HINTS,
  ERROR_TITLES,
  type EditDraft,
  type EditSubmission,
  type GenParams,
  type InputImage,
  type MaskImage,
} from "../lib/types";
import { draftToParams } from "../lib/workspace-rules";
import { useSettings } from "../store/settings";
import { useWorkspace } from "../store/workspace";
import { findRow } from "../store/workspace/selectors";
import {
  beginRun,
  beginSave,
  endRun,
  finishSave,
  markUnsaved,
  requestPromptFocus,
  setLastDoneId,
  setPartial,
} from "../store/workspace/actions";

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** 错误反馈统一走 toast：标题 + 服务端信息或建议 */
export function toastError(error: unknown) {
  const kind = error instanceof ApiError ? error.kind : "unknown";
  const detail =
    error instanceof ApiError && error.message
      ? error.message
      : ERROR_HINTS[kind];
  toast(`${ERROR_TITLES[kind]}：${detail}`);
}

/** 进行中请求的取消句柄：同一时间最多一个（由 beginRun 保证） */
let abort: AbortController | null = null;

export const cancelGenerate = () => abort?.abort();

/** 提交当前草稿 */
export function generate() {
  const { run, draft } = useWorkspace.getState();
  if (run.phase !== "idle") return;
  const checked = draftToParams({
    form: draft.form,
    inpaint: draft.inpaint,
    sizeAccepted: draft.sizeAccepted,
    reading: draft.readId !== null,
  });
  // 目标尺寸未接受时不发生成请求
  if (!checked.ok && checked.reason === "size-not-accepted") {
    if (checked.message) toast(checked.message);
    return;
  }
  setLastDoneId(null);
  if (!checked.ok) {
    if (checked.message) toast(checked.message);
    if (checked.focusPrompt) requestPromptFocus();
    return;
  }
  void runGeneration(
    checked.params,
    draft.inputs.length
      ? {
          inputs: draft.inputs,
          inputFidelity: draft.inputFidelity,
          ...(draft.inpaint ? { inpaint: draft.inpaint } : {}),
        }
      : null,
  );
}

/** 再来一版：用记录的参数与输入源直接重发；局部重绘记录复用同一底图与 mask（仅 complete 态可达） */
export function regenerate(id: string) {
  const row = findRow(useWorkspace.getState(), id);
  if (!row) return;
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
  void runGeneration({ ...row.params }, draft);
}

/** 尺寸按当前约束重算，恒合法 */
async function regenerateInpaint(row: HistoryRow) {
  const read = await readInpaintDraft(row);
  if (!read.ok) {
    toast(`${read.missing}不可用，无法再来一版`);
    return;
  }
  await runGeneration(read.params, read.draft);
}

/** 一次完整生成：占位 → 读来源 → 请求 → 写库；准备阶段已处于 generating，可以取消 */
async function runGeneration(params: GenParams, draft: EditDraft | null) {
  if (!beginRun({ n: params.n, size: params.size })) return;
  // 配置在开始时读一次，不订阅 settings
  const { baseUrl, apiKey } = useSettings.getState();
  const controller = new AbortController();
  abort = controller;
  try {
    const originPrompt = draft
      ? await resolveOriginPrompt(draft.inputs)
      : undefined;
    controller.signal.throwIfAborted();
    const startedAt = Date.now();
    const edit = draft
      ? await loadEditSubmission(draft, controller.signal)
      : undefined;
    const result = await requestImages(
      params,
      { baseUrl, apiKey },
      {
        signal: controller.signal,
        onPartial: (b64, index) => setPartial(b64ToBlob(b64), index),
      },
      edit,
    );
    controller.signal.throwIfAborted();
    const prepared = prepareGeneration(
      params,
      result,
      edit,
      startedAt,
      undefined,
      originPrompt,
    );
    beginSave(prepared);
    try {
      await saveGeneration(prepared);
    } catch {
      markUnsaved();
      toast(`${ERROR_TITLES["save-failed"]}：${ERROR_HINTS["save-failed"]}`);
      return;
    }
    finishSave(prepared);
    toast("生成完成");
  } catch (caught) {
    endRun();
    if (isAbortError(caught)) {
      toast("已取消生成");
      return;
    }
    toastError(caught);
  } finally {
    if (abort === controller) abort = null;
  }
}

/** 取首个输入源的原始描述（沿链路取最初；局部重绘 inputs[0] 恒为底图） */
async function resolveOriginPrompt(
  inputs: Array<{ generationId?: string }>,
): Promise<string | undefined> {
  const sourceId = inputs.find((input) => input.generationId)?.generationId;
  if (!sourceId) return undefined;
  const source = await db.history.get(sourceId);
  return source ? (source.originPrompt ?? source.prompt) : undefined;
}

/** 编辑类生成的输入：来源可能来自历史，读取失败（已被删除）是唯一需要拦截的情形 */
async function loadEditSubmission(
  draft: EditDraft,
  signal: AbortSignal,
): Promise<EditSubmission> {
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
  signal.throwIfAborted();
  const inpaint = draft.inpaint;
  return {
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

/** 读取局部重绘记录资源：底图、参考图、mask；原文件缺失可省略，其余阻断 */
export async function readInpaintDraft(
  row: HistoryRow,
): Promise<
  | { ok: true; draft: EditDraft; mask: MaskImage; params: GenParams }
  | { ok: false; missing: string }
> {
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
}
