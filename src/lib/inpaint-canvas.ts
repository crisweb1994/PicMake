/** 局部重绘 Canvas 浏览器侧（TECH_INPAINTING §6）：唯一覆盖率语义的栅格化与导出。
 *  笔触几何统一走 perfect-freehand（tldraw / Excalidraw freedraw 同款）：
 *  getStroke 由输入点列生成平滑的多边形轮廓，恒定宽度（thinning 0，IP-05 无压力变化），
 *  同一轮廓同时用于显示覆盖层、判空重放与 mask 导出——显示与请求不分叉（D5）。
 *  coverage 语义不变：初始透明，画笔 source-over 增加 alpha，擦除 destination-out。
 *  渲染为立即模式全量重绘（clear → 已提交命令 → 进行中笔触），
 *  不做任何增量合成，从根上避免半透明叠加产生的衰减与接缝。 */
import { getStroke } from "perfect-freehand";
import { MASK_ALPHA_THRESHOLD, maskOutputAlpha } from "./inpaint";
import type { MaskCommand, MaskDocument, MaskStroke } from "./types";

/** perfect-freehand 统一参数：恒定宽度圆头笔（IP-05：无羽化、无压力变化） */
const STROKE_OPTIONS = {
  size: 16,
  thinning: 0,
  smoothing: 0.5,
  streamline: 0.35,
  simulatePressure: false,
  easing: (t: number) => t,
  start: { cap: true, taper: 0 },
  end: { cap: true, taper: 0 },
} as const;

/** 点列 → 平滑笔触轮廓（文档坐标）；单击（单点）得到圆形轮廓 */
export function strokeOutline(
  points: MaskStroke["points"],
  size: number,
): Array<[number, number]> {
  return getStroke(
    points.map((p) => [p.x, p.y] as [number, number]),
    { ...STROKE_OPTIONS, size },
  ) as Array<[number, number]>;
}

function outlinePath(outline: Array<[number, number]>): Path2D {
  const path = new Path2D();
  if (!outline.length) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++)
    path.lineTo(outline[i][0], outline[i][1]);
  path.closePath();
  return path;
}

/**
 * 单条命令的笔触填充。调用方须已设置好指向文档坐标的 transform：
 * - pen：以 fillStyle 填充轮廓（coverage 重放传白色，显示层传覆盖色）
 * - eraser：destination-out 填充同一轮廓（减少覆盖）
 * - clear：清空画布
 */
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
  ctx.fillStyle = "#FFFFFF";
  ctx.fill(outlinePath(strokeOutline(cmd.points, cmd.width)));
  ctx.restore();
}

/** 重放命令[0, cursor) 到已按 scale 配好的 ctx（scale=1 即底图原始尺寸） */
export function replayCoverage(
  ctx: CanvasRenderingContext2D,
  doc: MaskDocument,
  cursor = doc.commands.length,
  scale = 1,
): void {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, doc.width, doc.height);
  for (let i = 0; i < cursor; i++) drawMaskCommand(ctx, doc.commands[i], doc);
  ctx.restore();
}

/**
 * 显示覆盖层重绘：全量重画已提交命令 + 进行中笔触。
 * 画笔以覆盖色 + 半透明呈现（独立视觉参数，不参与请求 alpha 计算——D5）；
 * 擦除以不透明度 1 的 destination-out 完全移除显示——半透明 destination-out
 * 只削掉一半 alpha 留残影，会与 coverage 语义（完全移除）分叉。
 */
export function paintOverlayLayer(
  ctx: CanvasRenderingContext2D,
  doc: MaskDocument,
  cursor = doc.commands.length,
  live: MaskStroke | null,
  scale: number,
  color: string,
  alpha = 0.5,
): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = color;
  const fillStroke = (cmd: MaskStroke) => {
    ctx.save();
    if (cmd.tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = alpha;
    }
    ctx.fill(outlinePath(strokeOutline(cmd.points, cmd.width)));
    ctx.restore();
  };
  for (let i = 0; i < cursor; i++) {
    const cmd = doc.commands[i];
    if (cmd.type === "clear") {
      // clear 命令清掉此前所有覆盖
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
      continue;
    }
    fillStroke(cmd);
  }
  if (live) fillStroke(live);
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
