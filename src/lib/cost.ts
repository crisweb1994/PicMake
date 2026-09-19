/** 尺寸校验与成本预估（口径见 docs/gpt-image-2.5-api.md §3.3 §5） */
import type { GenParams, Quality, SizeSpec } from './types'

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

/** 输出 token 单价：$30 / 百万 token */
const OUTPUT_USD_PER_TOKEN = 30 / 1_000_000

/** 1024×1024 下各质量档的近似输出 token 数（API 文档实测口径） */
const QUALITY_TOKENS_1K: Record<Quality, number> = {
  low: 196,
  medium: 439,
  high: 1756,
  xhigh: 3122,
  max: 7000,
}

/** 像素缩放因子：1024² 为基准，近似 sqrt 缩放（2K ≈ ×2，4K ≈ ×2.8） */
export function pixelFactor(size: SizeSpec): number {
  if (size === 'auto') return 1
  return Math.max(1, Math.sqrt((size.w * size.h) / (1024 * 1024)) * 1.02)
}

/** 单张预估成本（美元） */
export function estimateOneUsd(size: SizeSpec, quality: Quality): number {
  return QUALITY_TOKENS_1K[quality] * OUTPUT_USD_PER_TOKEN * pixelFactor(size)
}

/** 一次生成的预估成本 */
export function estimateUsd(params: Pick<GenParams, 'size' | 'quality' | 'n'>): number {
  return estimateOneUsd(params.size, params.quality) * params.n
}

/** 高成本组合：最高档 或 任一边 ≥ 2560，需要二次确认（MVP 文档 §6） */
export function isRisky(params: Pick<GenParams, 'size' | 'quality'>): boolean {
  if (params.quality === 'max') return true
  return params.size !== 'auto' && Math.max(params.size.w, params.size.h) >= 2560
}

export function formatUsd(v: number): string {
  return '$' + (v < 0.1 ? v.toFixed(3) : v.toFixed(2))
}
