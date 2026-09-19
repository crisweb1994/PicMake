/** 生成表单 ↔ API 参数映射（纯函数，供编排层与测试使用） */
import { validateSize } from './cost'
import type { Background, GenParams, ModelId, OutputFormat, Quality, SizeSpec } from './types'

export type RatioId = '1:1' | '4:3' | '3:4' | '3:2' | '2:3' | '16:9' | '9:16' | 'auto'

export const MODEL_LABELS: Record<ModelId, string> = { flare: 'Flare', sunburst: 'Sunburst' }

export const QUALITY_LABELS: Record<Quality, string> = {
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '超高',
  max: '最高',
}

/** 展示用尺寸文本，如 "1536 × 1024" / "自动" */
export function sizeText(size: SizeSpec): string {
  return size === 'auto' ? '自动' : `${size.w} × ${size.h}`
}

export const RATIO_CHIPS: ReadonlyArray<{ id: RatioId; label: string }> = [
  { id: '1:1', label: '1:1' },
  { id: '4:3', label: '4:3' },
  { id: '3:4', label: '3:4' },
  { id: '3:2', label: '3:2' },
  { id: '2:3', label: '2:3' },
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
  { id: 'auto', label: '自动' },
]

/** 各比例的基准像素（PRD FR-3） */
export const RATIO_DIMS: Record<Exclude<RatioId, 'auto'>, [number, number]> = {
  '1:1': [1024, 1024],
  '4:3': [1360, 1024],
  '3:4': [1024, 1360],
  '3:2': [1536, 1024],
  '2:3': [1024, 1536],
  '16:9': [1792, 1008],
  '9:16': [1008, 1792],
}

export interface GenForm {
  model: ModelId
  prompt: string
  ratio: Exclude<RatioId, 'auto'> | 'auto'
  /** 基准分辨率：比例生效时决定实际像素（自动尺寸下无效） */
  base: BaseRes
  cw: string
  ch: string
  quality: Quality
  n: number
  bg: Background
  fmt: OutputFormat
}

export type BaseRes = '1k' | '2k' | '4k'

export const BASE_LABELS: ReadonlyArray<{ id: BaseRes; label: string }> = [
  { id: '1k', label: '1K' },
  { id: '2k', label: '2K' },
  { id: '4k', label: '4K' },
]

export const DEFAULT_FORM: GenForm = {
  model: 'flare',
  prompt: '',
  ratio: '3:2',
  base: '1k',
  cw: '',
  ch: '',
  quality: 'high',
  n: 1,
  bg: 'auto',
  fmt: 'png',
}

export function isCustomActive(f: Pick<GenForm, 'cw' | 'ch'>): boolean {
  return f.cw !== '' || f.ch !== ''
}

/** 自定义宽高是否合法（不激活时恒合法） */
export function customOk(f: Pick<GenForm, 'cw' | 'ch'>): boolean {
  if (!isCustomActive(f)) return true
  const w = parseInt(f.cw, 10)
  const h = parseInt(f.ch, 10)
  return validateSize(w, h).length === 0
}

/** 表单 → 尺寸：自定义合法时优先；比例 × 基准分辨率次之；auto 交给 API */
export function formSize(f: Pick<GenForm, 'ratio' | 'base' | 'cw' | 'ch'>): SizeSpec {
  if (isCustomActive(f) && customOk(f)) {
    return { w: parseInt(f.cw, 10), h: parseInt(f.ch, 10) }
  }
  if (f.ratio === 'auto') return 'auto'
  const [w, h] = RATIO_DIMS[f.ratio]
  return scaleDims(w, h, f.base)
}

/** 按基准分辨率缩放 1K 基准尺寸，保持 /16 整除并夹在 3840 × 2160 内 */
export function scaleDims(w: number, h: number, base: BaseRes): { w: number; h: number } {
  if (base === '1k') return { w, h }
  if (base === '2k') return { w: w * 2, h: h * 2 }
  // 4K：等比放进 3840 × 2160 的框里
  const s = Math.min(3840 / w, 2160 / h)
  const round16 = (n: number) => Math.min(3840, Math.max(256, Math.round(n / 16) * 16))
  return { w: round16(w * s), h: round16(h * s) }
}

export function formToParams(f: GenForm): GenParams {
  return {
    model: f.model,
    prompt: f.prompt,
    size: formSize(f),
    quality: f.quality,
    n: f.n,
    background: f.bg,
    outputFormat: f.fmt,
  }
}

/** 复用参数：历史记录 → 表单（具体尺寸回填到自定义宽高） */
export function paramsToForm(p: GenParams): GenForm {
  const size: SizeSpec = p.size
  if (size === 'auto') {
    return { ...DEFAULT_FORM, ...p, ratio: 'auto', cw: '', ch: '', n: 1 }
  }
  return { ...DEFAULT_FORM, ...p, ratio: '3:2', cw: String(size.w), ch: String(size.h), n: 1 }
}
