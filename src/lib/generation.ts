import { b64ToBlob } from "./blob";
import type { EditSubmission, GenParams, ImageRequestResult } from "./types";
import type { HistoryRow, ImageRow } from "../db/schema";

export interface PreparedGeneration {
  row: HistoryRow;
  images: ImageRow[];
  source?: Pick<EditSubmission, "sourceBlob" | "sourceFormat"> & {
    imageId: string;
  };
}

export function prepareGeneration(
  params: GenParams,
  result: ImageRequestResult,
  edit: EditSubmission | undefined,
  startedAt: number,
  id: () => string = () => crypto.randomUUID(),
): PreparedGeneration {
  const mime =
    params.outputFormat === "jpeg"
      ? "image/jpeg"
      : params.outputFormat === "webp"
        ? "image/webp"
        : "image/png";
  const [width, height] =
    params.size === "auto" ? [0, 0] : [params.size.w, params.size.h];
  const images = result.images.map((image) => ({
    id: id(),
    blob: b64ToBlob(image.b64, mime),
    width,
    height,
    format: params.outputFormat,
  }));
  const row: HistoryRow = {
    id: id(),
    prompt: params.prompt,
    params,
    usage: result.usage,
    ...(edit
      ? { editSource: { ...edit.source, inputFidelity: edit.inputFidelity } }
      : {}),
    imageIds: images.map((image) => image.id),
    createdAt: Date.now(),
    durationMs: Math.max(0, Date.now() - startedAt),
  };
  return {
    row,
    images,
    ...(edit
      ? {
          source: {
            imageId: edit.source.imageId,
            sourceBlob: edit.sourceBlob,
            sourceFormat: edit.sourceFormat,
          },
        }
      : {}),
  };
}
