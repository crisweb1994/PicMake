import { b64Format, b64ToBlob } from "./blob";
import type { EditSubmission, GenParams, ImageRequestResult } from "./types";
import type { HistoryRow, ImageRow } from "../db/schema";

export interface PreparedGeneration {
  row: HistoryRow;
  images: ImageRow[];
  /** 保存所需资源（底图、参考图、mask、原文件）；mask/原文件不显示为图N */
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
): PreparedGeneration {
  const images = result.images.map((b64) => {
    const format = b64Format(b64) ?? params.outputFormat;
    return {
      id: id(),
      blob: b64ToBlob(b64, `image/${format}`),
      width: params.size === "auto" ? 0 : params.size.w,
      height: params.size === "auto" ? 0 : params.size.h,
      format,
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
  const sources: ImageRow[] = [
    ...(edit?.sources.map(({ image }) => image) ?? []),
    // mask 与原文件不进入 inputSources
    ...(edit?.inpaint
      ? [
          edit.inpaint.maskImage,
          ...(edit.inpaint.original ? [edit.inpaint.original.image] : []),
        ]
      : []),
  ];
  return { row, images, sources };
}
