/** 草图纯规则：坐标换算、命令提交、撤销游标、文档校验；Canvas 见 sketch-canvas.ts */
import type { SketchDocument, SketchPoint, SketchStroke } from "./types";

/** 固定色板（id 对应 i18n 资源 sketch.colors.*，用于无障碍名称；hex 为实际绘画颜色，不随主题） */
export const SKETCH_PALETTE = [
  { id: "black", hex: "#1A1A1A" },
  { id: "gray", hex: "#6B7280" },
  { id: "brown", hex: "#7C4A1E" },
  { id: "red", hex: "#E53935" },
  { id: "orange", hex: "#F4772E" },
  { id: "amber", hex: "#F5A623" },
  { id: "green", hex: "#2E9E4F" },
  { id: "teal", hex: "#1B8A7A" },
  { id: "sky", hex: "#26A9E0" },
  { id: "blue", hex: "#2E6FE8" },
  { id: "indigo", hex: "#4F46E5" },
  { id: "purple", hex: "#8B2FD6" },
  { id: "magenta", hex: "#D6247A" },
] as const;

export type SketchColorId = (typeof SKETCH_PALETTE)[number]["id"];

/** 内存保护阈值（建议值） */
export const SKETCH_MAX_COMMANDS = 2000;
export const SKETCH_MAX_POINTS = 100000;
/** 输出为 auto 时的新画布尺寸 */
export const SKETCH_DEFAULT_SIZE = 1024;

export function blankSketch(width: number, height: number): SketchDocument {
  return { version: 1, width, height, commands: [] };
}

/** 容器 CSS 像素 → 逻辑画布像素（显示缩放不改变文档坐标） */
export function toLogicalPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  doc: Pick<SketchDocument, "width" | "height">,
): SketchPoint {
  return {
    x: ((clientX - rect.left) * doc.width) / rect.width,
    y: ((clientY - rect.top) * doc.height) / rect.height,
  };
}

/** 画笔/橡皮粗细：滑杆位置 t∈[0,1]（上大下小），基准为逻辑画布短边 */
export function penWidth(
  t: number,
  doc: Pick<SketchDocument, "width" | "height">,
): number {
  return Math.max(1.5, (0.0025 + 0.028 * t) * Math.min(doc.width, doc.height));
}

export function eraserWidth(
  t: number,
  doc: Pick<SketchDocument, "width" | "height">,
): number {
  return Math.max(5, (0.02 + 0.055 * t) * Math.min(doc.width, doc.height));
}

export function makeStroke(
  tool: "pen" | "eraser",
  color: string | undefined,
  width: number,
): SketchStroke {
  return tool === "pen"
    ? { type: "stroke", tool, color, width, points: [] }
    : { type: "stroke", tool, width, points: [] };
}

/** 提交命令：丢弃重做分支；超上限拒绝。草图与选区共用 */
export function commitCommand<D extends SketchDocument>(
  doc: D,
  cursor: number,
  command: D["commands"][number],
): { doc: D; cursor: number } | null {
  if (doc.commands.length >= SKETCH_MAX_COMMANDS) return null;
  return {
    doc: { ...doc, commands: [...doc.commands.slice(0, cursor), command] },
    cursor: cursor + 1,
  };
}

export function totalPoints(
  doc: Pick<SketchDocument, "commands">,
  cursor = doc.commands.length,
): number {
  let n = 0;
  for (let i = 0; i < cursor; i++) {
    const cmd = doc.commands[i];
    if (cmd.type === "stroke") n += cmd.points.length;
  }
  return n;
}

/** 变更检测：提交前缀的稳定序列化 */
export function sketchSnapshotKey(
  doc: Pick<SketchDocument, "commands">,
  cursor = doc.commands.length,
): string {
  return JSON.stringify(doc.commands.slice(0, cursor));
}

/** 确认快照：只保留提交前缀，此后不可原地修改 */
export function freezeSketch<D extends SketchDocument>(
  doc: D,
  cursor: number,
): D {
  return { ...doc, commands: doc.commands.slice(0, cursor) };
}

/** 读取校验：只查结构完整（文档由本应用产出，笔画内容不作逐点复核） */
export function validateSketchDocument(value: unknown): SketchDocument | null {
  if (!value || typeof value !== "object") return null;
  const doc = value as Partial<SketchDocument>;
  const { width, height, commands } = doc;
  if (
    doc.version !== 1 ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    !width ||
    !height ||
    !Array.isArray(commands) ||
    !commands.every(
      (cmd) =>
        !!cmd &&
        (cmd.type === "clear" ||
          (cmd.type === "stroke" && Array.isArray(cmd.points))),
    )
  )
    return null;
  return doc as SketchDocument;
}

/** 比例是否不一致（容差 1%） */
export function ratioMismatch(
  a: { w: number; h: number },
  b: { w: number; h: number },
): boolean {
  return Math.abs(a.w / a.h - b.w / b.h) > 0.01;
}
