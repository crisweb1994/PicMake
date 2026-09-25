/** 局部重绘 Canvas 浏览器侧（TECH_INPAINTING §6）：唯一覆盖率语义的栅格化与导出。
 *  coverage 缓冲：初始透明（0=未选），画笔 source-over 白色增加 alpha，
 *  擦除 destination-out 减少 alpha；selected = coverageAlpha ≥ 128（D5）。
 *  显示覆盖层与请求 mask 由同一命令序列重放产生，UI 有效范围与请求透明范围不分叉。
 *  不含 React 状态；不依赖 DPR（文档坐标即底图像素）。 */
import { MASK_ALPHA_THRESHOLD, maskOutputAlpha } from "./inpaint";
import type { MaskCommand, MaskDocument } from "./types";

/** 单条命令绘制到 coverage；调用方须已设置好指向文档坐标的 transform */
export function drawMaskCommand(
  ctx: CanvasRenderingContext2D,
  cmd: MaskCommand,
  size: Pick<MaskDocument, "width" | "height">,
): void {
  if (cmd.type === "clear") {
    ctx.clearRect(0, 0, size.width, size.height);
    return;
  }
  ctx.save();
  if (cmd.tool === "eraser") ctx.globalCompositeOperation = "destination-out";
  // RGB 填白只为简化缓冲；选区判断只看 alpha，白色不参与语义
  ctx.strokeStyle = "#FFFFFF";
  ctx.fillStyle = "#FFFFFF";
  ctx.lineWidth = cmd.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const points = cmd.points;
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, cmd.width / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++)
      ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

/** 重放命令[0, cursor) 到已按 scale 配好的 ctx（scale=1 即底图原始尺寸） */
export function replayCoverage(
  ctx: CanvasRenderingContext2D,
  doc: MaskDocument,
  cursor = doc.commands.length,
  scale = 1,
): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, doc.width, doc.height);
  for (let i = 0; i < cursor; i++) drawMaskCommand(ctx, doc.commands[i], doc);
}

/** 显示覆盖层：把 coverage 位图以指定颜色整层着色（同一栅格结果，
 *  不透明度是独立视觉参数，不参与请求 alpha 计算——D5） */
export function paintOverlay(
  ctx: CanvasRenderingContext2D,
  coverage: HTMLCanvasElement,
  color: string,
  alpha = 0.5,
): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(coverage, 0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

/** 快速判空（按钮态用）：降采样重放后扫描 selected 像素（alpha ≥ 128）。
 *  确认时的权威判空见 exportMaskPng 的全尺寸检查（IP-05）。 */
export function maskHasSelectionQuick(
  doc: MaskDocument,
  cursor = doc.commands.length,
): boolean {
  const scale = Math.min(1, 512 / Math.max(doc.width, doc.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(doc.width * scale));
  canvas.height = Math.max(1, Math.round(doc.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  replayCoverage(ctx, doc, cursor, scale);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4)
    if (data[i] >= MASK_ALPHA_THRESHOLD) return true;
  return false;
}

export interface MaskExport {
  /** 成功时为 PNG Blob；失败为 null（issue 说明原因） */
  blob: Blob | null;
  /** empty-mask：全尺寸栅格后 selected 像素为 0；canvas-failed：可检测的 Canvas 失败 */
  issue: "empty-mask" | "canvas-failed" | null;
  /** selected 像素数（成功时 > 0） */
  selected: number;
}

/** 导出（IP-07/TECH §6.4）：底图原始尺寸，全尺寸栅格化后按 D5 二值化——
 *  selected 像素 alpha=0（待编辑），其余 alpha=255；RGB 全图填白。
 *  空选区以 selected 像素数为 0 判定；可检测的 Canvas 失败保留全部工作内容。 */
export async function exportMaskPng(
  doc: MaskDocument,
  cursor = doc.commands.length,
): Promise<MaskExport> {
  const cov = document.createElement("canvas");
  cov.width = doc.width;
  cov.height = doc.height;
  const cctx = cov.getContext("2d", { willReadFrequently: true });
  if (!cctx) return { blob: null, issue: "canvas-failed", selected: 0 };
  let image: ImageData;
  try {
    replayCoverage(cctx, doc, cursor);
    image = cctx.getImageData(0, 0, doc.width, doc.height);
  } catch {
    return { blob: null, issue: "canvas-failed", selected: 0 };
  }
  const out = document.createElement("canvas");
  out.width = doc.width;
  out.height = doc.height;
  const octx = out.getContext("2d");
  if (!octx) return { blob: null, issue: "canvas-failed", selected: 0 };
  let selected = 0;
  const src = image.data;
  const dst = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    dst[i] = 255;
    dst[i + 1] = 255;
    dst[i + 2] = 255;
    const alpha = maskOutputAlpha(src[i + 3]);
    if (alpha === 0) selected++;
    dst[i + 3] = alpha;
  }
  if (selected === 0) return { blob: null, issue: "empty-mask", selected: 0 };
  try {
    octx.putImageData(new ImageData(dst, doc.width, doc.height), 0, 0);
  } catch {
    return { blob: null, issue: "canvas-failed", selected: 0 };
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    out.toBlob(resolve, "image/png"),
  );
  cov.width = 0;
  cov.height = 0;
  out.width = 0;
  out.height = 0;
  return { blob, issue: blob ? null : "canvas-failed", selected };
}
