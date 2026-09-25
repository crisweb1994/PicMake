/**
 * OpenAI 兼容 API 客户端（官方或中转站）。
 * 约定见 docs/gpt-image-2.5-api.md：响应恒为 b64_json；流式走 SSE。
 * 生成是单次请求事务：无自动降级、无重试、无会话级记忆（PRD FR-4，2026-09-22）。
 */
import { createParser } from "eventsource-parser";
import { apiUrl } from "../lib/url";
import {
  ApiError,
  MODEL_NAMES,
  type ApiConfig,
  type GenParams,
  type ImageGenResult,
  type ImageRequestResult,
  type EditSubmission,
  type Usage,
} from "../lib/types";

function mapStatus(
  status: number,
  code: string | undefined,
  message: string,
): ApiError {
  if (status === 401)
    return new ApiError("auth", message || "Key 无效", status);
  if (status === 403)
    return new ApiError("org-unverified", message || "组织未验证", status);
  if (status === 429)
    return new ApiError("rate-limit", message || "请求过于频繁", status);
  if (status === 400 && /content|policy/i.test(code ?? "")) {
    return new ApiError("content-policy", message || "内容被拦截", status);
  }
  if (status >= 500)
    return new ApiError("server", message || "服务端错误", status);
  return new ApiError("unknown", message || `请求失败（${status}）`, status);
}

async function toApiError(res: Response): Promise<ApiError> {
  let message = "";
  let code: string | undefined;
  try {
    const j = await res.json();
    message = j?.error?.message ?? "";
    code = j?.error?.code;
  } catch {
    /* 非 JSON 响应体 */
  }
  return mapStatus(res.status, code, message);
}

async function raise(res: Response): Promise<never> {
  throw await toApiError(res);
}

async function fetchJson<T>(
  path: string,
  config: ApiConfig,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(config.baseUrl, path), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        ...(init?.headers ?? {}),
      },
    });
  } catch (e) {
    if (init?.signal?.aborted) throw e;
    throw new ApiError("network", "无法连接到 API 地址");
  }
  if (!res.ok) await raise(res);
  return (await res.json()) as T;
}

/* ── 连接测试：GET /models，最便宜的校验方式 ── */

export async function testConnection(
  config: ApiConfig,
): Promise<{ ok: true; models: string[] } | { ok: false; error: ApiError }> {
  try {
    const j = await fetchJson<{ data?: Array<{ id: string }> }>(
      "/models",
      config,
    );
    return { ok: true, models: (j.data ?? []).map((m) => m.id) };
  } catch (e) {
    return { ok: false, error: e as ApiError };
  }
}

/* ── 参数映射 ── */

function toBody(params: GenParams): string {
  return JSON.stringify({
    model: MODEL_NAMES[params.model],
    prompt: params.prompt,
    n: params.n,
    size: params.size === "auto" ? "auto" : `${params.size.w}x${params.size.h}`,
    quality: params.quality,
    background: params.background,
    output_format: params.outputFormat,
    moderation: "auto",
    stream: true,
    partial_images: 3,
  });
}

export function mapUsage(u: any): Usage | null {
  if (!u || typeof u.output_tokens !== "number") return null;
  const inputDetailsAvailable =
    typeof u.input_tokens_details?.text_tokens === "number" &&
    typeof u.input_tokens_details?.image_tokens === "number";
  return {
    totalTokens: u.total_tokens ?? 0,
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    textTokens: inputDetailsAvailable ? u.input_tokens_details.text_tokens : 0,
    imageTokens: inputDetailsAvailable
      ? u.input_tokens_details.image_tokens
      : 0,
    inputDetailsAvailable,
  };
}

/* ── 非流式生成 ── */

/** 解析非流式响应体（普通请求与流式嗅探共用） */
export function parseGenResponse(j: any): ImageRequestResult {
  const results: ImageGenResult[] = (j.data ?? []).map((d: any) => ({
    b64: d.b64_json,
    size: j.size,
    quality: j.quality,
    background: j.background,
    outputFormat: j.output_format,
  }));
  if (
    !results.length ||
    results.some((r) => typeof r.b64 !== "string" || !r.b64)
  )
    throw new ApiError("unknown", "响应中没有图片数据");
  return { images: results, usage: mapUsage(j.usage) };
}

/* ── 异步任务型中转（如 apimart）：
      POST /images/generations 恒回 {data:[{status:"submitted",task_id}]}
      （与 stream 无关），需轮询 GET /tasks/{task_id} 到 completed，
      结果是 data.result.images[].url[] 的图片 URL（CORS *），非 b64 ── */

const TASK_POLL_INTERVAL_MS = 3000;
const TASK_POLL_TIMEOUT_MS = 300_000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** 响应是「任务已提交」而非图片 */
function extractTaskId(j: any): string | null {
  const item = j?.data?.[0];
  if (
    item &&
    typeof item.task_id === "string" &&
    item.task_id &&
    !item.b64_json &&
    !item.url
  ) {
    return item.task_id;
  }
  return null;
}

/** 任务结果是图片 URL，下载转 b64 走统一管线 */
async function urlToB64(url: string, signal?: AbortSignal): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new ApiError("network", "结果图片下载失败，请重试");
  }
  if (!res.ok)
    throw new ApiError("unknown", `结果图片下载失败（HTTP ${res.status}）`);
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new ApiError("unknown", "结果图片读取失败"));
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

/** 轮询任务到完成取图；保留请求级 usage */
async function resolveTaskResult(
  taskId: string,
  config: ApiConfig,
  signal?: AbortSignal,
): Promise<ImageRequestResult> {
  const deadline = Date.now() + TASK_POLL_TIMEOUT_MS;
  for (;;) {
    const j = await fetchJson<any>(
      `/tasks/${encodeURIComponent(taskId)}`,
      config,
      { signal },
    );
    const d = j?.data;
    const status = typeof d?.status === "string" ? d.status : "";
    if (status === "completed" && d?.result) {
      const urls: string[] = (d.result.images ?? []).flatMap(
        (im: any) => im.url ?? [],
      );
      if (!urls.length)
        throw new ApiError("unknown", "任务完成但响应中没有图片数据");
      const b64s = await Promise.all(urls.map((u) => urlToB64(u, signal)));
      return { images: b64s.map((b64) => ({ b64 })), usage: mapUsage(d.usage) };
    }
    if (status === "failed" || status === "error" || status === "cancelled") {
      const msg = d?.error?.message ?? d?.message ?? j?.error?.message;
      throw new ApiError(
        "server",
        typeof msg === "string" && msg ? msg : "任务执行失败",
      );
    }
    if (Date.now() > deadline)
      throw new ApiError("server", "任务超时未完成（5 分钟）");
    await sleep(TASK_POLL_INTERVAL_MS, signal);
  }
}

/* ── 流式生成：SSE 渐进预览 ── */

export interface StreamHandlers {
  onPartial?: (b64: string, index: number) => void;
  signal?: AbortSignal;
}

/** 文生图和编辑共享传输与错误语义；配置在调用时固定。 */
export function generateImageStream(
  params: GenParams,
  config: ApiConfig,
  handlers: StreamHandlers = {},
): Promise<ImageRequestResult> {
  return requestImages(params, handlers, config);
}

export function generateImageEditStream(
  submission: EditSubmission,
  config: ApiConfig,
  handlers: StreamHandlers = {},
): Promise<ImageRequestResult> {
  return requestImages(submission.params, handlers, config, submission);
}

/** 浏览器负责 multipart boundary；文件扩展名来自已存的来源格式。 */
export function editFormData(submission: EditSubmission): FormData {
  const form = new FormData();
  const fields = JSON.parse(toBody(submission.params));
  delete fields.moderation;
  for (const [key, value] of Object.entries(fields))
    form.append(key, String(value));
  // auto 不发送：部分中转对 flare 等模型拒绝 input_fidelity（invalid_input_fidelity_model）
  if (submission.inputFidelity !== "auto")
    form.append("input_fidelity", submission.inputFidelity);
  for (const { image } of submission.sources) {
    const ext = image.format === "jpeg" ? "jpg" : image.format;
    // 单图保留已有通道字段；多图使用 OpenAI 的 image[] multipart 数组。
    form.append(
      submission.sources.length === 1 ? "image" : "image[]",
      image.blob,
      `source.${ext}`,
    );
  }
  return form;
}

/** SSE 分帧包装：纯解析，支持两种端点和 event 字段。 */
export function createImageParser(
  handlers: StreamHandlers,
  result: ImageRequestResult,
) {
  return createParser({
    onEvent(ev) {
      if (!ev.data || ev.data === "[DONE]") return;
      let d: any;
      try {
        d = JSON.parse(ev.data);
      } catch {
        return;
      }
      const type = d.type ?? ev.event;
      if (type === "error" || d.error) {
        const error = d.error ?? d;
        throw mapStatus(
          error.status ?? 400,
          error.code,
          error.message ?? "生成失败",
        );
      }
      if (/^image_(generation|edit)\.partial_image$/.test(type) && d.b64_json) {
        handlers.onPartial?.(d.b64_json, d.partial_image_index ?? 0);
      } else if (
        /^image_(generation|edit)\.completed$/.test(type) &&
        d.b64_json
      ) {
        const image: ImageGenResult = {
          b64: d.b64_json,
          size: d.size,
          quality: d.quality,
          background: d.background,
          outputFormat: d.output_format,
        };
        result.images.push(image);
        // usage 是请求级总量，后续完成事件的总量回显覆盖，绝不按图相加。
        result.usage = mapUsage(d.usage) ?? result.usage;
      }
    },
  });
}

async function requestImages(
  params: GenParams,
  handlers: StreamHandlers,
  config: ApiConfig,
  edit?: EditSubmission,
): Promise<ImageRequestResult> {
  const url = apiUrl(
    config.baseUrl,
    edit ? "/images/edits" : "/images/generations",
  );
  let res: Response;
  try {
    handlers.signal?.throwIfAborted();
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        ...(!edit ? { "Content-Type": "application/json" } : {}),
      },
      body: edit ? editFormData(edit) : toBody(params),
      signal: handlers.signal,
    });
  } catch (e) {
    if (handlers.signal?.aborted) throw e;
    throw new ApiError("network", "无法连接到 API 地址");
  }
  if (!res.ok) await raise(res);
  // 中转对 stream 请求回 JSON（普通响应或任务单）时就地解析，
  // 不重发请求——重发等于同一批图计费两次。
  if ((res.headers.get("content-type") ?? "").includes("json")) {
    const j = await res.json();
    const taskId = extractTaskId(j);
    return taskId
      ? resolveTaskResult(taskId, config, handlers.signal)
      : parseGenResponse(j);
  }
  if (!res.body) throw new ApiError("unknown", "响应没有内容");
  const result: ImageRequestResult = { images: [], usage: null };
  const parser = createImageParser(handlers, result);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let streamError: unknown;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.feed(decoder.decode(value, { stream: true }));
    }
    parser.feed(decoder.decode());
    parser.reset({ consume: true });
  } catch (e) {
    streamError = e;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  handlers.signal?.throwIfAborted();
  if (streamError) throw streamError;
  if (!result.images.length)
    throw new ApiError("unknown", "响应中没有图片数据");
  return result;
}
