/** 草图 Canvas 浏览器侧（SKETCH_RESEARCH_AND_SPEC §9）：统一顺序重放、alpha 判空、
 *  白底合成导出。预览与导出共用同一绘制规则；不含任何 React 状态。 */
import type { SketchCommand, SketchDocument } from "./types";

/** 单条命令绘制；调用方须已设置好指向逻辑坐标的 transform */
export function drawSketchCommand(
  ctx: CanvasRenderingContext2D,
  cmd: SketchCommand,
  size: Pick<SketchDocument, "width" | "height">,
): void {
  if (cmd.type === "clear") {
    ctx.clearRect(0, 0, size.width, size.height);
    return;
  }
  ctx.save();
  if (cmd.tool === "eraser") ctx.globalCompositeOperation = "destination-out";
  const color = cmd.tool === "pen" ? (cmd.color ?? "#1A1A1A") : "#000000";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
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

/** 重放命令[0, cursor) 到已按 scale 缩放配好的 ctx（scale=1 即文档原始尺寸） */
export function replaySketch(
  ctx: CanvasRenderingContext2D,
  doc: SketchDocument,
  cursor = doc.commands.length,
  scale = 1,
): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, doc.width, doc.height);
  for (let i = 0; i < cursor; i++) drawSketchCommand(ctx, doc.commands[i], doc);
}

/** 空白判定：渲染后的笔迹层是否存在有效 alpha 像素（§6.5）。
 *  降采样到最长边 ≤512 扫描，供每次重放后的按钮态使用。 */
export function sketchHasInk(
  doc: SketchDocument,
  cursor = doc.commands.length,
): boolean {
  const scale = Math.min(1, 512 / Math.max(doc.width, doc.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(doc.width * scale));
  canvas.height = Math.max(1, Math.round(doc.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  replaySketch(ctx, doc, cursor, scale);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 2) return true;
  return false;
}

export type SketchExport = { ink: false } | { ink: true; blob: Blob | null };

/** 导出（§6.2/§9）：文档原始尺寸、先笔迹层判空、再合成白底；不乘 DPR、不含任何浮层 */
export async function exportSketchPng(
  doc: SketchDocument,
): Promise<SketchExport> {
  const strokes = document.createElement("canvas");
  strokes.width = doc.width;
  strokes.height = doc.height;
  const sctx = strokes.getContext("2d", { willReadFrequently: true });
  if (!sctx) return { ink: true, blob: null };
  replaySketch(sctx, doc);
  const data = sctx.getImageData(0, 0, doc.width, doc.height).data;
  let ink = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 8) {
      ink = true;
      break;
    }
  }
  if (!ink) return { ink: false };
  const out = document.createElement("canvas");
  out.width = doc.width;
  out.height = doc.height;
  const octx = out.getContext("2d");
  if (!octx) return { ink: true, blob: null };
  octx.fillStyle = "#FFFFFF";
  octx.fillRect(0, 0, doc.width, doc.height);
  octx.drawImage(strokes, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) =>
    out.toBlob(resolve, "image/png"),
  );
  return { ink: true, blob };
}
