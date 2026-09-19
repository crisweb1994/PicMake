/**
 * OpenAI 兼容 API 客户端（官方或中转站）。
 * 约定见 docs/gpt-image-2.5-api.md：响应恒为 b64_json；流式走 SSE，
 * 中转站流式失败自动降级为非流式重试一次。
 */
import { createParser } from 'eventsource-parser'
import { apiUrl } from '../lib/url'
import {
  ApiError,
  MODEL_NAMES,
  type ApiErrorKind,
  type GenParams,
  type ImageGenResult,
  type Usage,
} from '../lib/types'
import { useSettings } from '../store/settings'

function headers(): Record<string, string> {
  const { apiKey } = useSettings.getState()
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
}

function mapStatus(status: number, code: string | undefined, message: string): ApiError {
  if (status === 401) return new ApiError('auth', message || 'Key 无效', status)
  if (status === 403) return new ApiError('org-unverified', message || '组织未验证', status)
  if (status === 429) return new ApiError('rate-limit', message || '请求过于频繁', status)
  if (status === 400 && /content|policy/i.test(code ?? '')) {
    return new ApiError('content-policy', message || '内容被拦截', status)
  }
  if (status >= 500) return new ApiError('server', message || '服务端错误', status)
  return new ApiError('unknown', message || `请求失败（${status}）`, status)
}

async function toApiError(res: Response): Promise<ApiError> {
  let message = ''
  let code: string | undefined
  try {
    const j = await res.json()
    message = j?.error?.message ?? ''
    code = j?.error?.code
  } catch {
    /* 非 JSON 响应体 */
  }
  return mapStatus(res.status, code, message)
}

async function raise(res: Response): Promise<never> {
  throw await toApiError(res)
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(apiUrl(useSettings.getState().baseUrl, path), {
      ...init,
      headers: { ...headers(), ...(init?.headers ?? {}) },
    })
  } catch {
    throw new ApiError('network', '无法连接到 API 地址')
  }
  if (!res.ok) await raise(res)
  return (await res.json()) as T
}

/* ── 连接测试：GET /models，最便宜的校验方式 ── */

export async function testConnection(): Promise<{ ok: true; models: string[] } | { ok: false; error: ApiError }> {
  try {
    const j = await fetchJson<{ data?: Array<{ id: string }> }>('/models')
    return { ok: true, models: (j.data ?? []).map((m) => m.id) }
  } catch (e) {
    return { ok: false, error: e as ApiError }
  }
}

/* ── 参数映射 ── */

function toBody(params: GenParams, stream: boolean): string {
  return JSON.stringify({
    model: MODEL_NAMES[params.model],
    prompt: params.prompt,
    n: params.n,
    size: params.size === 'auto' ? 'auto' : `${params.size.w}x${params.size.h}`,
    quality: params.quality,
    background: params.background,
    output_format: params.outputFormat,
    moderation: 'auto',
    stream,
    ...(stream ? { partial_images: 3 } : {}),
  })
}

function mapUsage(u: any): Usage | null {
  if (!u || typeof u.output_tokens !== 'number') return null
  return {
    totalTokens: u.total_tokens ?? 0,
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    textTokens: u.input_tokens_details?.text_tokens ?? 0,
    imageTokens: u.input_tokens_details?.image_tokens ?? 0,
  }
}

/* ── 非流式生成 ── */

/** 解析非流式响应体（generateImage 与流式嗅探共用） */
function parseGenResponse(j: any): ImageGenResult[] {
  const results: ImageGenResult[] = (j.data ?? []).map((d: any) => ({
    b64: d.b64_json,
    usage: mapUsage(j.usage),
    size: j.size,
    quality: j.quality,
    background: j.background,
    outputFormat: j.output_format,
  }))
  if (!results.length) throw new ApiError('unknown', '响应中没有图片数据')
  return results
}

export async function generateImage(params: GenParams, signal?: AbortSignal): Promise<ImageGenResult[]> {
  const j = await fetchJson<any>('/images/generations', {
    method: 'POST',
    body: toBody(params, false),
    signal,
  })
  const taskId = extractTaskId(j)
  if (taskId) return resolveTaskResult(taskId, signal)
  return parseGenResponse(j)
}

/* ── 异步任务型中转（如 apimart）：
      POST /images/generations 恒回 {data:[{status:"submitted",task_id}]}
      （与 stream 无关），需轮询 GET /tasks/{task_id} 到 completed，
      结果是 data.result.images[].url[] 的图片 URL（CORS *），非 b64 ── */

const TASK_POLL_INTERVAL_MS = 3000
const TASK_POLL_TIMEOUT_MS = 300_000

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

/** 响应是「任务已提交」而非图片 */
function extractTaskId(j: any): string | null {
  const item = j?.data?.[0]
  if (item && typeof item.task_id === 'string' && item.task_id && !item.b64_json && !item.url) {
    return item.task_id
  }
  return null
}

/** 任务结果是图片 URL，下载转 b64 走统一管线 */
async function urlToB64(url: string, signal?: AbortSignal): Promise<string> {
  let res: Response
  try {
    res = await fetch(url, { signal })
  } catch (e) {
    if (signal?.aborted) throw e
    throw new ApiError('network', '结果图片下载失败，请重试')
  }
  if (!res.ok) throw new ApiError('unknown', `结果图片下载失败（HTTP ${res.status}）`)
  const blob = await res.blob()
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new ApiError('unknown', '结果图片读取失败'))
    reader.readAsDataURL(blob)
  })
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}

/** 轮询任务到完成取图；任务级 usage 按张均摊，避免多图时重复计入成本 */
async function resolveTaskResult(taskId: string, signal?: AbortSignal): Promise<ImageGenResult[]> {
  const deadline = Date.now() + TASK_POLL_TIMEOUT_MS
  for (;;) {
    const j = await fetchJson<any>(`/tasks/${taskId}`, { signal })
    const d = j?.data
    const status = typeof d?.status === 'string' ? d.status : ''
    if (status === 'completed' && d?.result) {
      const urls: string[] = (d.result.images ?? []).flatMap((im: any) => im.url ?? [])
      if (!urls.length) throw new ApiError('unknown', '任务完成但响应中没有图片数据')
      const b64s = await Promise.all(urls.map((u) => urlToB64(u, signal)))
      const usage = mapUsage(d.usage)
      if (!usage) return b64s.map((b64) => ({ b64, usage: null }))
      const each = Math.max(1, Math.round(usage.outputTokens / b64s.length))
      return b64s.map((b64, i) => ({
        b64,
        usage: {
          ...usage,
          inputTokens: i === 0 ? usage.inputTokens : 0,
          textTokens: i === 0 ? usage.textTokens : 0,
          imageTokens: i === 0 ? usage.imageTokens : 0,
          outputTokens: each,
          totalTokens: (i === 0 ? usage.inputTokens : 0) + each,
        },
      }))
    }
    if (status === 'failed' || status === 'error' || status === 'cancelled') {
      const msg = d?.error?.message ?? d?.message ?? j?.error?.message
      throw new ApiError('server', typeof msg === 'string' && msg ? msg : '任务执行失败')
    }
    if (Date.now() > deadline) throw new ApiError('server', '任务超时未完成（5 分钟）')
    await sleep(TASK_POLL_INTERVAL_MS, signal)
  }
}

/* ── 流式生成：SSE 渐进预览，失败自动降级非流式 ── */

/**
 * 流式能力记忆（会话级）：某地址「流式失败 + 非流式重试成功」一次后，
 * 本次会话内该地址直接走非流式——排队型中转要等 20–50s 才报流式错误，
 * 不该每次生成都撞一遍。不持久化：刷新重探一次的代价，远小于为此
 * 新增持久化（AGENTS.md §5：持久化只有 IndexedDB 与 settings 两处）。
 */
let noStreamBaseUrl: string | null = null

/** 这些错误与传输方式无关，换非流式也必然同样失败，直接抛给用户 */
const NO_FALLBACK_KINDS: ReadonlySet<ApiErrorKind> = new Set(['auth', 'org-unverified', 'content-policy'])

export interface StreamHandlers {
  onPartial?: (b64: string, index: number) => void
  onCompleted?: (result: ImageGenResult) => void
  /** 流式不可用、自动降级为非流式时通知（PRD FR-4：toast 告知） */
  onFallback?: () => void
  signal?: AbortSignal
}

export async function generateImageStream(params: GenParams, handlers: StreamHandlers = {}): Promise<ImageGenResult[]> {
  const baseUrl = useSettings.getState().baseUrl
  if (baseUrl === noStreamBaseUrl) return generateImage(params, handlers.signal)

  /** 降级为非流式重试；成功才记住该地址不支持流式（失败则下次仍可尝试流式） */
  const fallback = async (): Promise<ImageGenResult[]> => {
    handlers.onFallback?.()
    const results = await generateImage(params, handlers.signal)
    noStreamBaseUrl = baseUrl
    return results
  }

  let res: Response
  try {
    res = await fetch(apiUrl(baseUrl, '/images/generations'), {
      method: 'POST',
      headers: headers(),
      body: toBody(params, true),
      signal: handlers.signal,
    })
  } catch (e) {
    if (handlers.signal?.aborted) throw e
    // 网络层失败：降级为非流式重试一次
    return fallback()
  }

  if (!res.ok) {
    const err = await toApiError(res)
    // auth/内容政策等与流式无关的错误直接抛；其余（中转 4xx 明确拒绝
    // stream、流式路由 429/5xx，见 docs §7.7）降级重试一次——非流式是
    // 严格更兼容的子集，失败的请求不计费，最坏代价是多一次往返
    if (NO_FALLBACK_KINDS.has(err.kind)) throw err
    return fallback()
  }

  // 中转站静默忽略 stream:true、直接返回完整 JSON：就地解析，
  // 绝不重发请求（重发 = 同一批图计费两次）。任务型中转（apimart）
  // 也走这里——它的提交响应就是 JSON 任务单，转轮询取图
  if ((res.headers.get('content-type') ?? '').includes('json')) {
    handlers.onFallback?.()
    noStreamBaseUrl = baseUrl
    const j = await res.json()
    const taskId = extractTaskId(j)
    if (taskId) return resolveTaskResult(taskId, handlers.signal)
    return parseGenResponse(j)
  }

  const body = res.body
  if (!body) return fallback() // 200 但无 body：当空流处理

  const results: ImageGenResult[] = []
  const parser = createParser({
    onEvent(ev) {
      if (!ev.data) return
      let d: any
      try {
        d = JSON.parse(ev.data)
      } catch {
        return
      }
      if (d.type === 'image_generation.partial_image' && d.b64_json) {
        handlers.onPartial?.(d.b64_json, d.partial_image_index ?? 0)
      } else if (d.type === 'image_generation.completed' && d.b64_json) {
        const r: ImageGenResult = { b64: d.b64_json, usage: mapUsage(d.usage) }
        results.push(r)
        handlers.onCompleted?.(r)
      }
    },
  })

  const reader = body.getReader()
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      parser.feed(decoder.decode(value, { stream: true }))
    }
  } catch (e) {
    if (handlers.signal?.aborted) throw e
    // 流中断且还没有任何结果：降级非流式
    if (!results.length) return fallback()
    throw e
  } finally {
    reader.releaseLock()
  }

  if (!results.length) {
    // 整个流结束但没拿到完成事件（部分中转站行为）：降级
    return fallback()
  }
  return results
}
