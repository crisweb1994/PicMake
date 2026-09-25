/** base64 → Blob */
import { imageFormat } from "./input-images";

export function b64ToBlob(b64: string, mime = "image/png"): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** 从实际字节识别格式并解码宽高（TECH §10.1）：一次处理一张并关闭位图；
 *  不把请求 output_format/size 当成结果事实。失败返回 null（按不可继续编辑处理）。 */
export async function decodeImageMeta(
  blob: Blob,
): Promise<{ width: number; height: number; format: string } | null> {
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const format = imageFormat(bytes);
  if (!format) return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const meta = { width: bitmap.width, height: bitmap.height, format };
    bitmap.close();
    return meta;
  } catch {
    return null;
  }
}
