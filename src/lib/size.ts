/** 自定义尺寸校验 */
export const SIZE_LIMITS = { max: 3840, ratio: 3 } as const

/** 校验自定义宽高：能被 16 整除、比例 1:3～3:1、不超过 3840×2160 */
export function validateSize(w: number, h: number): string[] {
  const errs: string[] = []
  if (!Number.isInteger(w) || !Number.isInteger(h)) errs.push('宽高须为整数')
  if (w % 16 !== 0 || h % 16 !== 0) errs.push('宽高须能被 16 整除')
  if (w / h > SIZE_LIMITS.ratio || h / w > SIZE_LIMITS.ratio) errs.push('宽高比须在 1:3 ～ 3:1 之间')
  if (w > SIZE_LIMITS.max || h > SIZE_LIMITS.max) errs.push(`宽高上限 ${SIZE_LIMITS.max} × 2160`)
  if (w <= 0 || h <= 0) errs.push('宽高须为正数')
  return errs
}
