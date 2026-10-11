/** 导出结果：下载图片、复制描述。图片 URL 由 hooks 提供，这里只触发保存 */
import { toast } from "@heroui/react";
import { downloadName } from "../lib/download";
import type { DisplayGen } from "../lib/view-models";

export function downloadImage(display: DisplayGen, index: number) {
  const image = display.images[index];
  if (!image) return;
  const a = document.createElement("a");
  a.href = image.url;
  a.download = downloadName(display.row.id, index, image.format);
  a.click();
}

export function downloadAll(display: DisplayGen) {
  display.images.forEach((_, index) => downloadImage(display, index));
}

export function copyPrompt(prompt: string) {
  void navigator.clipboard
    ?.writeText(prompt)
    .then(() => toast("画面描述已复制"));
}
