/** OpenAI 兼容 API 客户端：响应恒为 b64_json，流式走 SSE；单次请求事务，无降级无重试 */
import { createParser } from "eventsource-parser";
import { apiUrl } from "../lib/url";
import {
  ApiError,
  MODEL_NAMES,
  type ApiConfig,
  type GenParams,
  type ImageRequestResult,
  type EditSubmission,
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
  if (!res.ok) throw await toApiError(res);
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

function bodyFields(
  params: GenParams,
): Record<string, string | number | boolean> {
  return {
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
  };
}

function toBody(params: GenParams): string {
  return JSON.stringify(bodyFields(params));
}

/* ── 非流式生成 ── */

/** 解析非流式响应体（普通请求与流式嗅探共用）；usage 原样保存 */
export function parseGenResponse(j: any): ImageRequestResult {
  const images: string[] = (j.data ?? []).map((d: any) => d.b64_json);
  if (!images.length || images.some((b64) => typeof b64 !== "string" || !b64))
    throw new ApiError("unknown", "响应中没有图片数据");
  return { images, usage: j.usage ?? null };
}

/* ── 异步任务型中转（如 apimart）：恒回任务单，轮询 GET /tasks/{id} 到 completed 取图片 URL ── */

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
      return { images: b64s, usage: d.usage ?? null };
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

/** multipart 构造；局部重绘追加 mask 部件，不手工设置 boundary */
export function editFormData(
  submission: EditSubmission,
  params: GenParams,
): FormData {
  const form = new FormData();
  const fields = bodyFields(params);
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
  if (submission.inpaint)
    form.append("mask", submission.inpaint.maskImage.blob, "mask.png");
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
        result.images.push(d.b64_json);
        // usage 是请求级总量，后续完成事件的总量回显覆盖，绝不按图相加。
        if (d.usage) result.usage = d.usage;
      }
    },
  });
}

/** 文生图和编辑共享传输与错误语义；配置在调用时固定。edit 存在时走 /images/edits。 */
export async function requestImages(
  params: GenParams,
  config: ApiConfig,
  handlers: StreamHandlers = {},
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
      body: edit ? editFormData(edit, params) : toBody(params),
      signal: handlers.signal,
    });
  } catch (e) {
    if (handlers.signal?.aborted) throw e;
    throw new ApiError("network", "无法连接到 API 地址");
  }
  if (!res.ok) throw await toApiError(res);
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
