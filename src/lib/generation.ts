import { b64ToBlob } from "./blob";
import type { EditSubmission, GenParams, ImageRequestResult } from "./types";
import type { HistoryRow, ImageRow } from "../db/schema";

/** 结果图片的解码元信息（以实际字节为准） */
export type ResultMeta = { width: number; height: number; format: string };

export interface PreparedGeneration {
  row: HistoryRow;
  images: ImageRow[];
  /** 保存所需资源（底图、参考图、mask、原文件，去重）；mask/原文件不显示为图N */
  sources: ImageRow[];
}

export function prepareGeneration(
  params: GenParams,
  result: ImageRequestResult,
  edit: EditSubmission | undefined,
  startedAt: number,
  id: () => string = () => crypto.randomUUID(),
  /** 编辑/参考生成时的原始描述 */
  originPrompt?: string,
  /** 逐张实际解码元信息；缺省回退请求参数 */
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
    // mask 与原文件不进入 inputSources
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
