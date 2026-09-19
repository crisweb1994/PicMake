/** 核心类型定义（对照 docs/gpt-image-2.5-api.md） */

export type ModelId = 'flare' | 'sunburst'
export type Quality = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type Background = 'auto' | 'transparent' | 'opaque'
export type OutputFormat = 'png' | 'jpeg' | 'webp'

export const MODEL_NAMES: Record<ModelId, string> = {
  flare: 'gpt-image-2.5-flare',
  sunburst: 'gpt-image-2.5-sunburst',
}

/** 尺寸：'auto' 或具体宽高（宽高均须被 16 整除） */
export type SizeSpec = { w: number; h: number } | 'auto'

export interface GenParams {
  model: ModelId
  prompt: string
  size: SizeSpec
  quality: Quality
  /** 1–10，产品上限 4 */
  n: number
  background: Background
  outputFormat: OutputFormat
}

export interface Usage {
  totalTokens: number
  inputTokens: number
  outputTokens: number
  textTokens: number
  imageTokens: number
}

export interface ImageGenResult {
  b64: string
  usage: Usage | null
  /** 回显参数（可缺省） */
  size?: string
  quality?: string
  background?: string
  outputFormat?: string
}

export type ApiErrorKind =
  | 'auth' // 401：Key 无效
  | 'org-unverified' // 403：组织未完成资格验证
  | 'rate-limit' // 429
  | 'content-policy' // 内容政策拦截
  | 'server' // 5xx
  | 'network'
  | 'unknown'

export class ApiError extends Error {
  kind: ApiErrorKind
  status?: number

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
  }
}

export const ERROR_HINTS: Record<ApiErrorKind, string> = {
  auth: 'API Key 无效或已失效，请在设置中检查。',
  'org-unverified': '组织尚未完成图片模型的资格验证（organization verification）。',
  'rate-limit': '请求过于频繁，稍等片刻再试。',
  'content-policy': '画面描述可能包含受限制的内容，调整描述后重试。',
  server: '服务端暂时不可用，请稍后重试。',
  network: '网络错误：无法连接到 API 地址，请检查网络或中转站配置。',
  unknown: '生成失败，请重试。',
}

/** 错误横幅标题（FR-8） */
export const ERROR_TITLES: Record<ApiErrorKind, string> = {
  auth: 'API Key 无效',
  'org-unverified': '组织未完成验证',
  'rate-limit': '请求过于频繁',
  'content-policy': '生成被内容政策拦截',
  server: '服务端暂时不可用',
  network: '无法连接到 API 地址',
  unknown: '生成失败',
}
