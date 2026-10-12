/** 自定义尺寸校验 */
export const SIZE_LIMITS = { long: 3840, short: 2160, ratio: 3 } as const;

/** 自定义尺寸的问题码；界面文案见 i18n 资源 issues.* */
export type SizeIssue =
  "not-integer" | "not-multiple-16" | "ratio" | "too-large" | "not-positive";

/** 校验自定义宽高：16 整除、比例 1:3～3:1、长边 ≤ 3840 且短边 ≤ 2160 */
export function validateSize(w: number, h: number): SizeIssue[] {
  const issues: SizeIssue[] = [];
  if (!Number.isInteger(w) || !Number.isInteger(h)) issues.push("not-integer");
  if (w % 16 !== 0 || h % 16 !== 0) issues.push("not-multiple-16");
  if (w / h > SIZE_LIMITS.ratio || h / w > SIZE_LIMITS.ratio)
    issues.push("ratio");
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  if (long > SIZE_LIMITS.long || short > SIZE_LIMITS.short)
    issues.push("too-large");
  if (w <= 0 || h <= 0) issues.push("not-positive");
  return issues;
}
