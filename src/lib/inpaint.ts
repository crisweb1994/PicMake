/** 局部重绘纯规则：尺寸建议、底图约束、mask 校验、画笔范围、二值语义。Canvas 见 inpaint-canvas.ts */
import type { InpaintIssue, MaskCommand, MaskDocument } from "./types";

/** 底图像素保护阈值（产品保护值，非设备上限） */
export const INPAINT_MAX_PIXELS = 16_777_216;

/** selected = coverageAlpha ≥ 128 */
export const MASK_ALPHA_THRESHOLD = 128;

/** mask 应用侧保守上限（API 参考写「小于 4 MB」） */
export const MASK_MAX_BYTES = 4_000_000;

/** 底图硬性检查：比例、面积先于解码拦截 */
export function checkInpaintBase(
  w: number,
  h: number,
): { ok: true } | { ok: false; issue: InpaintIssue } {
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 16 || h < 16)
    return { ok: false, issue: "invalid-mask" };
  if (w * h > INPAINT_MAX_PIXELS) return { ok: false, issue: "pixel-limit" };
  if (w > h * 3 || h > w * 3) return { ok: false, issue: "ratio-limit" }; // 1:3–3:1 之外阻止
  return { ok: true };
}

export type SuggestResult =
  | { w: number; h: number }
  | {
      err:
        "invalid-dimensions" | "pixel-limit" | "ratio-limit" | "invalid-output";
    };

/** 建议尺寸算法：与 validateSize 同一长短边约束 */
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
  return result;
}

/** 建议尺寸的人类可读原因 */
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

/** 输出目标：能原尺寸直出则原尺寸，否则建议尺寸 */
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

/** 画笔粗细：短边 S，范围 1～round(S/4)，初始 round(S/30) */
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

/** 读取校验：只查结构完整（文档由本应用产出，命令内容不作逐点复核） */
export function validateMaskDocument(
  value: unknown,
): { doc: MaskDocument } | { issue: InpaintIssue } {
  if (!value || typeof value !== "object") return { issue: "invalid-mask" };
  const raw = value as Partial<MaskDocument>;
  const { width, height, commands } = raw;
  if (
    raw.version !== 1 ||
    typeof raw.baseImageId !== "string" ||
    !raw.baseImageId ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
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
    return { issue: "invalid-mask" };
  return {
    doc: {
      version: 1,
      baseImageId: raw.baseImageId,
      width,
      height,
      commands: commands as MaskCommand[],
    },
  };
}

/** 二值映射：selected（≥128）导出透明，其余不透明白 */
export function maskOutputAlpha(alpha: number): number {
  return alpha >= MASK_ALPHA_THRESHOLD ? 0 : 255;
}
