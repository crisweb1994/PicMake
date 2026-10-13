/** 下载文件名：PicMake-{记录 id 前 8 位}-{序号}[-{宽}x{高}].{实际格式扩展名}；序号从 1 开始，删除其他记录后不变。
 *  多尺寸记录传入图片的实际尺寸，文件名带像素，拿到文件就知道是哪个尺寸 */
export function downloadName(
  rowId: string,
  index: number,
  format: string,
  size?: { w: number; h: number },
): string {
  const ext = format === "jpeg" ? "jpg" : format;
  const dims = size && size.w > 0 && size.h > 0 ? `-${size.w}x${size.h}` : "";
  return `PicMake-${rowId.slice(0, 8)}-${index + 1}${dims}.${ext}`;
}
