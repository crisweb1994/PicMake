/** 草图纯规则（SKETCH_RESEARCH_AND_SPEC §8/§9）：坐标换算、命令提交、撤销游标、
 *  文档校验与变更检测。只放纯函数，Canvas 重放与导出见 sketch-canvas.ts。 */
import type {
  SketchCommand,
  SketchDocument,
  SketchPoint,
  SketchStroke,
} from "./types";

/** 固定色板（名称用于无障碍；值为实际绘画颜色，不随主题） */
export const SKETCH_PALETTE: ReadonlyArray<{
  name: string;
  hex: string;
}> = [
  { name: "黑色", hex: "#1A1A1A" },
  { name: "灰色", hex: "#6B7280" },
  { name: "棕色", hex: "#7C4A1E" },
  { name: "红色", hex: "#E53935" },
  { name: "橙色", hex: "#F4772E" },
  { name: "琥珀", hex: "#F5A623" },
  { name: "绿色", hex: "#2E9E4F" },
  { name: "青绿", hex: "#1B8A7A" },
  { name: "天蓝", hex: "#26A9E0" },
  { name: "蓝色", hex: "#2E6FE8" },
  { name: "靛蓝", hex: "#4F46E5" },
  { name: "紫色", hex: "#8B2FD6" },
  { name: "品红", hex: "#D6247A" },
];

/** 内存保护阈值（§9：待实测的建议值，不是性能承诺） */
export const SKETCH_MAX_COMMANDS = 2000;
export const SKETCH_MAX_POINTS = 100000;
/** 输出为 auto 时的新画布尺寸（§6.4） */
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

/** 提交一个完整命令：丢弃撤销后的重做分支；超上限拒绝（保留已完成内容） */
export function commitCommand(
  doc: SketchDocument,
  cursor: number,
  command: SketchCommand,
): { doc: SketchDocument; cursor: number } | null {
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

/** 变更检测：提交前缀的稳定序列化（§6.5 有修改才拦截关闭、§8.2 无修改沿用原附件） */
export function sketchSnapshotKey(
  doc: Pick<SketchDocument, "commands">,
  cursor = doc.commands.length,
): string {
  return JSON.stringify(doc.commands.slice(0, cursor));
}

/** 确认快照：只保留提交前缀，重做分支不落库；此后文档不可原地修改（§8.4） */
export function freezeSketch(
  doc: SketchDocument,
  cursor = doc.commands.length,
): SketchDocument {
  return { ...doc, commands: doc.commands.slice(0, cursor) };
}

/** 深拷贝文档（命令与点数组全新），用于会话快照防御性复制 */
export function cloneSketchDocument(doc: SketchDocument): SketchDocument {
  return {
    ...doc,
    commands: doc.commands.map((cmd) =>
      cmd.type === "stroke"
        ? { ...cmd, points: cmd.points.map((p) => ({ ...p })) }
        : { ...cmd },
    ),
  };
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** 读取校验（§9）：拒绝异常尺寸、非有限坐标、越界笔宽、坏颜色与不支持的版本 */
export function validateSketchDocument(value: unknown): SketchDocument | null {
  if (!value || typeof value !== "object") return null;
  const doc = value as Partial<SketchDocument>;
  if (doc.version !== 1) return null;
  const { width, height } = doc;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    !width ||
    !height ||
    width < 256 ||
    height < 256 ||
    width > 3840 ||
    height > 3840
  )
    return null;
  if (!Array.isArray(doc.commands)) return null;
  const limit = Math.max(width, height) * 2;
  for (const cmd of doc.commands) {
    if (!cmd || typeof cmd !== "object") return null;
    if (cmd.type === "clear") continue;
    if (cmd.type !== "stroke") return null;
    if (cmd.tool !== "pen" && cmd.tool !== "eraser") return null;
    if (!Number.isFinite(cmd.width) || cmd.width <= 0 || cmd.width > limit)
      return null;
    if (
      cmd.tool === "pen" &&
      (typeof cmd.color !== "string" || !HEX_COLOR.test(cmd.color))
    )
      return null;
    if (!Array.isArray(cmd.points) || cmd.points.length === 0) return null;
    for (const p of cmd.points) {
      if (!p || typeof p !== "object") return null;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
      // 笔迹允许画到边缘略出界，但拒绝大幅越界坐标
      if (
        p.x < -limit ||
        p.x > width + limit ||
        p.y < -limit ||
        p.y > height + limit
      )
        return null;
    }
  }
  return doc as SketchDocument;
}

/** 输出比例与草图比例是否不一致（§6.4 就地提示；容差 1%） */
export function ratioMismatch(
  a: { w: number; h: number },
  b: { w: number; h: number },
): boolean {
  return Math.abs(a.w / a.h - b.w / b.h) > 0.01;
}
