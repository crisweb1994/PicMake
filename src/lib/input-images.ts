import type { HistoryRow, ImageRow } from "../db/schema";
import {
  ApiError,
  ERROR_HINTS,
  MAX_INPUT_BYTES,
  type InputSource,
  type OutputFormat,
} from "./types";

/** 唯一的新旧来源投影，展示和删除必须使用相同规则。 */
export function historySources(row: HistoryRow): InputSource[] {
  return (
    row.inputSources ??
    (row.editSource
      ? [
          {
            imageId: row.editSource.imageId,
            generationId: row.editSource.generationId,
          },
        ]
      : [])
  );
}

export function imageFormat(bytes: Uint8Array): OutputFormat | null {
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v))
    return "png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpeg";
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "webp";
  return null;
}

export async function readInputImage(file: File): Promise<ImageRow> {
  if (!file.size || file.size >= MAX_INPUT_BYTES)
    throw new ApiError("image-too-large", ERROR_HINTS["image-too-large"]);
  const format = imageFormat(
    new Uint8Array(await file.slice(0, 12).arrayBuffer()),
  );
  if (!format)
    throw new ApiError("invalid-image", ERROR_HINTS["invalid-image"]);
  const blob = file.slice(0, file.size, `image/${format}`);
  try {
    const bitmap = await createImageBitmap(blob);
    const { width, height } = bitmap;
    bitmap.close();
    return { id: crypto.randomUUID(), blob, width, height, format };
  } catch {
    throw new ApiError("invalid-image", ERROR_HINTS["invalid-image"]);
  }
}
