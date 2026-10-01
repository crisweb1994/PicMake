/** 局部重绘 Canvas 侧：覆盖率栅格化与导出。笔触走 perfect-freehand，同一轮廓用于
 *  显示、判空与导出；立即模式全量重绘，无增量合成。coverage：画笔增 alpha，擦除 destination-out */
import { getStroke } from "perfect-freehand";
import { MASK_ALPHA_THRESHOLD, maskOutputAlpha } from "./inpaint";
import type { MaskCommand, MaskDocument, MaskStroke } from "./types";

// perfect-freehand 参数：恒定宽度圆头笔
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

/** 单条命令填充；调用方须已设好指向文档坐标的 transform */
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

/** 显示覆盖层全量重绘。擦除必须以不透明度 1 完全移除——半透明会留残影 */
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

/** 快速判空（按钮态）：降采样扫描；权威判空见 exportMaskPng */
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

/** 导出：底图原始尺寸全尺寸栅格化后二值化；空选区/Canvas 失败保留工作内容 */
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
  let selected = 0;
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    const alpha = maskOutputAlpha(data[i + 3]);
    if (alpha === 0) selected++;
    data[i + 3] = alpha;
  }
  if (selected === 0) return { blob: null, issue: "empty-mask", selected: 0 };
  try {
    cctx.putImageData(image, 0, 0);
  } catch {
    return { blob: null, issue: "canvas-failed", selected: 0 };
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    cov.toBlob(resolve, "image/png"),
  );
  return { blob, issue: blob ? null : "canvas-failed", selected };
}
