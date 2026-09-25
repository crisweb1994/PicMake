import { b64ToBlob } from "./blob";
import type { EditSubmission, GenParams, ImageRequestResult } from "./types";
import type { HistoryRow, ImageRow } from "../db/schema";

/** 结果图片的解码元信息（TECH §10.1：由实际字节识别，非请求参数回填） */
export type ResultMeta = { width: number; height: number; format: string };

export interface PreparedGeneration {
  row: HistoryRow;
  images: ImageRow[];
  /** 保存所需资源集合（实际底图、参考图、mask、可选原文件，按 id 去重）。
   *  与 history.inputSources（实际请求图片列表）区分：mask/原文件不发送、不显示为图N。 */
  sources: ImageRow[];
}

export function prepareGeneration(
  params: GenParams,
  result: ImageRequestResult,
  edit: EditSubmission | undefined,
  startedAt: number,
  id: () => string = () => crypto.randomUUID(),
  /** 编辑/参考生成时首个输入源记录的原始描述（PRD 2026-09-23） */
  originPrompt?: string,
  /** 逐张结果的实际解码元信息；缺省回退请求参数（未知格式按 0 宽高处理） */
  resultMetas?: ResultMeta[],
): PreparedGeneration {
  const fallbackMime =
    params.outputFormat === "jpeg"
      ? "image/jpeg"
      : params.outputFormat === "webp"
        ? "image/webp"
        : "image/png";
  const images = result.images.map((image, index) => {
    const meta = resultMetas?.[index];
    return {
      id: id(),
      blob: b64ToBlob(image.b64, meta ? `image/${meta.format}` : fallbackMime),
      width: meta?.width ?? (params.size === "auto" ? 0 : params.size.w),
      height: meta?.height ?? (params.size === "auto" ? 0 : params.size.h),
      format: meta?.format ?? params.outputFormat,
    };
  });
  const row: HistoryRow = {
    id: id(),
    prompt: params.prompt,
    params,
    usage: result.usage,
    ...(edit
      ? {
          inputSources: edit.sources.map(({ source }) => ({ ...source })),
          inputFidelity: edit.inputFidelity,
        }
      : {}),
    ...(edit?.inpaint
      ? {
          inpaint: {
            maskImageId: edit.inpaint.maskImage.id,
            ...(edit.inpaint.original
              ? { originalSource: { ...edit.inpaint.original.source } }
              : {}),
          },
        }
      : {}),
    ...(originPrompt ? { originPrompt } : {}),
    imageIds: images.map((image) => image.id),
    createdAt: Date.now(),
    durationMs: Math.max(0, Date.now() - startedAt),
  };
  const sourceIds = new Set<string>();
  const sources: ImageRow[] = [];
  for (const image of [
    ...(edit?.sources.map(({ image }) => image) ?? []),
    // mask 与原文件属于「保存所需资源」，不进入 inputSources（TECH §10.2）
    ...(edit?.inpaint
      ? [
          edit.inpaint.maskImage,
          ...(edit.inpaint.original ? [edit.inpaint.original.image] : []),
        ]
      : []),
  ]) {
    if (sourceIds.has(image.id)) continue;
    sourceIds.add(image.id);
    sources.push(image);
  }
  return { row, images, sources };
}
