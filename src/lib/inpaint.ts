/** 局部重绘纯规则（PRD_INPAINTING IP-05/IP-10，TECH_INPAINTING §6/§7）：
 *  尺寸建议与底图约束、mask 文档校验、画笔范围、覆盖率二值语义、输出目标尺寸。
 *  只放纯函数；Canvas 重放与导出见 inpaint-canvas.ts，EXIF 读取见 image-orientation.ts。 */
import { SKETCH_MAX_COMMANDS } from "./sketch";
import type {
  InpaintIssue,
  MaskCommand,
  MaskDocument,
  MaskStroke,
} from "./types";
import { validateSize } from "./size";

/** D2：底图像素保护阈值（待真机实测的产品保护值，不是设备上限承诺） */
export const INPAINT_MAX_PIXELS = 16_777_216;

/** D5：selected = coverageAlpha ≥ 128；mask alpha = selected ? 0 : 255 */
export const MASK_ALPHA_THRESHOLD = 128;

/** D6/TECH §6.4：mask 应用侧保守上限（内部 API 参考写「小于 4 MB」，未实测；不擅自当 4 MiB） */
export const MASK_MAX_BYTES = 4_000_000;

/** 底图进入编辑器前的硬性检查（IP-10：比例、面积先于解码拦截，避免画完才发现不可用） */
export function checkInpaintBase(
  w: number,
  h: number,
): { ok: true } | { ok: false; issue: InpaintIssue } {
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 16 || h < 16)
    return { ok: false, issue: "invalid-mask" };
  if (w * h > INPAINT_MAX_PIXELS) return { ok: false, issue: "pixel-limit" };
  if (w > h * 3 || h > w * 3) return { ok: false, issue: "ratio-limit" }; // Q10：1:3–3:1 之外阻止
  return { ok: true };
}

export type SuggestResult =
  | { w: number; h: number }
  | {
      err:
        "invalid-dimensions" | "pixel-limit" | "ratio-limit" | "invalid-output";
    };

/** D3/D4 建议尺寸算法（TECH §7 契约示例同款；与共享 validateSize 遵循同一长短边约束） */
export function suggestInpaintSize(w: number, h: number): SuggestResult {
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 16 || h < 16)
    return { err: "invalid-dimensions" };
  if (w * h > INPAINT_MAX_PIXELS) return { err: "pixel-limit" };
  if (w > h * 3 || h > w * 3) return { err: "ratio-limit" };

  const landscape = w >= h;
  let long = Math.floor(Math.max(w, h) / 16) * 16;
  let short = Math.floor(Math.min(w, h) / 16) * 16;
  long = Math.min(long, short * 3);
  const scale = Math.min(1, 3840 / long, 2160 / short);
  long = Math.floor((long * scale) / 16) * 16;
  short = Math.floor((short * scale) / 16) * 16;
  long = Math.min(long, short * 3);
  const result = landscape ? { w: long, h: short } : { w: short, h: long };
  if (result.w < 16 || result.h < 16) return { err: "invalid-output" };
  // 应用接入时还须过共享 validateSize；此处先兜底（16 对齐 + 4K 框 + 比例）
  if (validateSize(result.w, result.h).length) return { err: "invalid-output" };
  return result;
}

/** 建议尺寸的人类可读原因（IP-10：就地显示原/目标尺寸与原因） */
export function sizeReason(w: number, h: number): string {
  const parts: string[] = [];
  const floor16 = (n: number) => Math.floor(n / 16) * 16;
  if (floor16(w) !== w || floor16(h) !== h) {
    const seg: string[] = [];
    if (floor16(w) !== w) seg.push("宽度");
    if (floor16(h) !== h) seg.push("高度");
    parts.push(`${seg.join("与")}向下取 16 的倍数`);
  }
  const frame = Math.min(1, 3840 / Math.max(w, h), 2160 / Math.min(w, h));
  if (frame < 1) parts.push("等比放入 3840 × 2160 输出框");
  return parts.join("，") || "原尺寸合法直出";
}

/** 局部重绘的输出目标：能合法原尺寸直出则原尺寸，否则建议尺寸（IP-10） */
export function inpaintTargetSize(
  w: number,
  h: number,
): {
  w: number;
  h: number;
  suggested: boolean;
  reason: string;
} | null {
  const check = checkInpaintBase(w, h);
  if (!check.ok) return null;
  const out = suggestInpaintSize(w, h);
  if ("err" in out) return null;
  const suggested = out.w !== w || out.h !== h;
  return { ...out, suggested, reason: sizeReason(w, h) };
}

/** 画笔粗细（IP-05）：底图短边 S，范围 1～max(1, round(S/4))，初始 clamp(round(S/30), 1, 上限) */
export function maskBrushRange(w: number, h: number) {
  const s = Math.min(w, h);
  const max = Math.max(1, Math.round(s / 4));
  const initial = Math.min(max, Math.max(1, Math.round(s / 30)));
  return { min: 1, max, initial };
}

export function blankMask(
  baseImageId: string,
  width: number,
  height: number,
): MaskDocument {
  return { version: 1, baseImageId, width, height, commands: [] };
}

export function makeMaskStroke(
  tool: "pen" | "eraser",
  width: number,
): MaskStroke {
  return { type: "stroke", tool, width, points: [] };
}

/** 提交一个完整命令：丢弃撤销后的重做分支；沿用草图 2000 命令 / 100000 点保护阈值 */
export function commitMaskCommand(
  doc: MaskDocument,
  cursor: number,
  command: MaskCommand,
): { doc: MaskDocument; cursor: number } | null {
  if (doc.commands.length >= SKETCH_MAX_COMMANDS) return null;
  return {
    doc: { ...doc, commands: [...doc.commands.slice(0, cursor), command] },
    cursor: cursor + 1,
  };
}

export function totalMaskPoints(
  doc: Pick<MaskDocument, "commands">,
  cursor = doc.commands.length,
): number {
  let n = 0;
  for (let i = 0; i < cursor; i++) {
    const cmd = doc.commands[i];
    if (cmd.type === "stroke") n += cmd.points.length;
  }
  return n;
}

/** 变更检测：提交前缀的稳定序列化（无实质修改沿用原资源，IP-07） */
export function maskSnapshotKey(
  doc: Pick<MaskDocument, "commands">,
  cursor = doc.commands.length,
): string {
  return JSON.stringify(doc.commands.slice(0, cursor));
}

/** 确认快照：只保留提交前缀；此后文档不可原地修改（TECH §3.1） */
export function freezeMask(
  doc: MaskDocument,
  cursor = doc.commands.length,
): MaskDocument {
  return { ...doc, commands: doc.commands.slice(0, cursor) };
}

/**
 * 读取校验（IP-11.4）：版本、底图绑定、尺寸、有限坐标、笔宽与点数上限。
 *  允许本功能支持的底图尺寸，不继承草图的 3840 边长上限（TECH §6.2）。
 *  expectedBase/expectedDims 存在时校验绑定一致（底图不匹配 → base-mismatch）。
 */
export function validateMaskDocument(
  value: unknown,
  expectedBase?: string,
  expectedDims?: { width: number; height: number },
): { doc: MaskDocument } | { issue: InpaintIssue } {
  if (!value || typeof value !== "object") return { issue: "invalid-mask" };
  const raw = value as Partial<MaskDocument>;
  if (raw.version !== 1) return { issue: "invalid-mask" };
  if (typeof raw.baseImageId !== "string" || !raw.baseImageId)
    return { issue: "invalid-mask" };
  const width = raw.width;
  const height = raw.height;
  if (typeof width !== "number" || typeof height !== "number")
    return { issue: "invalid-mask" };
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 16 ||
    height < 16 ||
    width * height > INPAINT_MAX_PIXELS
  )
    return { issue: "invalid-mask" };
  if (expectedBase !== undefined && raw.baseImageId !== expectedBase)
    return { issue: "base-mismatch" };
  if (
    expectedDims !== undefined &&
    (width !== expectedDims.width || height !== expectedDims.height)
  )
    return { issue: "base-mismatch" };
  if (!Array.isArray(raw.commands)) return { issue: "invalid-mask" };
  const limit = Math.max(width, height) * 2;
  for (const cmd of raw.commands) {
    if (!cmd || typeof cmd !== "object") return { issue: "invalid-mask" };
    if (cmd.type === "clear") continue;
    if (cmd.type !== "stroke") return { issue: "invalid-mask" };
    if (cmd.tool !== "pen" && cmd.tool !== "eraser")
      return { issue: "invalid-mask" };
    if (!Number.isFinite(cmd.width) || cmd.width <= 0 || cmd.width > limit)
      return { issue: "invalid-mask" };
    if (!Array.isArray(cmd.points) || cmd.points.length === 0)
      return { issue: "invalid-mask" };
    for (const p of cmd.points) {
      if (!p || typeof p !== "object") return { issue: "invalid-mask" };
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
        return { issue: "invalid-mask" };
      // 笔迹允许画到边缘略出界，但拒绝大幅越界坐标
      if (
        p.x < -limit ||
        p.x > width + limit ||
        p.y < -limit ||
        p.y > height + limit
      )
        return { issue: "invalid-mask" };
    }
  }
  return {
    doc: {
      version: 1,
      baseImageId: raw.baseImageId,
      width,
      height,
      commands: raw.commands as MaskCommand[],
    },
  };
}

/** D5 二值映射：coverage alpha → selected。0/127 → false；128/255 → true。 */
export function coverageSelected(alpha: number): boolean {
  return alpha >= MASK_ALPHA_THRESHOLD;
}

/** D5 输出映射：selected 像素导出透明（0），其余不透明（255） */
export function maskOutputAlpha(alpha: number): number {
  return coverageSelected(alpha) ? 0 : 255;
}

/** 全选覆盖判定（IP-05：全部涂满属于有效选区，提示覆盖整张图片） */
export function isFullyCovered(
  selected: number,
  width: number,
  height: number,
) {
  return width > 0 && height > 0 && selected >= width * height * 0.995;
}
