/** 自定义尺寸校验 */
export const SIZE_LIMITS = { long: 3840, short: 2160, ratio: 3 } as const;

/** 校验自定义宽高：能被 16 整除、比例 1:3～3:1、长边 ≤ 3840 且短边 ≤ 2160（D4 旋转归一的 4K 框） */
export function validateSize(w: number, h: number): string[] {
  const errs: string[] = [];
  if (!Number.isInteger(w) || !Number.isInteger(h)) errs.push("宽高须为整数");
  if (w % 16 !== 0 || h % 16 !== 0) errs.push("宽高须能被 16 整除");
  if (w / h > SIZE_LIMITS.ratio || h / w > SIZE_LIMITS.ratio)
    errs.push("宽高比须在 1:3 ～ 3:1 之间");
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  if (long > SIZE_LIMITS.long || short > SIZE_LIMITS.short)
    errs.push(`长宽上限 ${SIZE_LIMITS.long} × ${SIZE_LIMITS.short}`);
  if (w <= 0 || h <= 0) errs.push("宽高须为正数");
  return errs;
}
