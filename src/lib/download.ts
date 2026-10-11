/** 下载文件名：PicMake-{记录 id 前 8 位}-{序号}.{实际格式扩展名}；序号从 1 开始，删除其他记录后不变 */
export function downloadName(
  rowId: string,
  index: number,
  format: string,
): string {
  const ext = format === "jpeg" ? "jpg" : format;
  return `PicMake-${rowId.slice(0, 8)}-${index + 1}.${ext}`;
}
