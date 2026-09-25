/** 核心类型定义（对照 docs/gpt-image-2.5-api.md） */

export type ModelId = "flare" | "sunburst";
export type Quality = "low" | "medium" | "high" | "xhigh" | "max";
export type Background = "auto" | "transparent" | "opaque";
export type InputFidelity = "low" | "high";
/** 表单与提交的保真度选择：auto = 不发送 input_fidelity，交给服务端默认
 *  （部分中转对 flare 等模型拒绝该参数，报 invalid_input_fidelity_model） */
export type FidelityChoice = "auto" | InputFidelity;
export type OutputFormat = "png" | "jpeg" | "webp";

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
}

export const MODEL_NAMES: Record<ModelId, string> = {
  flare: "gpt-image-2.5-flare",
  sunburst: "gpt-image-2.5-sunburst",
};

/** 尺寸：'auto' 或具体宽高（宽高均须被 16 整除） */
export type SizeSpec = { w: number; h: number } | "auto";

export interface GenParams {
  model: ModelId;
  prompt: string;
  size: SizeSpec;
  quality: Quality;
  /** 1–10，产品上限 4 */
  n: number;
  background: Background;
  outputFormat: OutputFormat;
}

/** 有序输入来源；本地文件没有 generationId。 */
export interface InputSource {
  imageId: string;
  generationId?: string;
  name?: string;
}

export interface InputImage extends InputSource {
  /** 仅上传草稿持有原图，历史作品在提交时读取。 */
  upload?: import("../db/schema").ImageRow;
}

export interface EditDraft {
  inputs: InputImage[];
  inputFidelity: FidelityChoice;
}

export interface EditSubmission {
  params: GenParams;
  sources: { source: InputSource; image: import("../db/schema").ImageRow }[];
  inputFidelity: FidelityChoice;
}

/** ══ 草图（SKETCH_RESEARCH_AND_SPEC §8.1）：可重放的绘制命令文档，随 ImageRow 持久化 ══ */

export interface SketchPoint {
  x: number;
  y: number;
}

/** 一笔 = 一次完整拖动或一次单击（圆点）；橡皮忽略颜色 */
export interface SketchStroke {
  type: "stroke";
  tool: "pen" | "eraser";
  color?: string;
  width: number;
  points: SketchPoint[];
}

export interface SketchClear {
  type: "clear";
}

export type SketchCommand = SketchStroke | SketchClear;

export interface SketchDocument {
  version: 1;
  width: number;
  height: number;
  commands: SketchCommand[];
}

export const MAX_INPUT_IMAGES = 16;
export const MAX_INPUT_BYTES = 50 * 1024 * 1024;

export interface Usage {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  textTokens: number;
  imageTokens: number;
  inputDetailsAvailable: boolean;
}

export interface ImageGenResult {
  b64: string;
  /** 回显参数（可缺省） */
  size?: string;
  quality?: string;
  background?: string;
  outputFormat?: string;
}

export interface ImageRequestResult {
  images: ImageGenResult[];
  usage: Usage | null;
}

export type ApiErrorKind =
  | "invalid-image"
  | "image-too-large"
  | "too-many-images"
  | "source-unavailable"
  | "save-failed"
  | "auth" // 401：Key 无效
  | "org-unverified" // 403：组织未完成资格验证
  | "rate-limit" // 429
  | "content-policy" // 内容政策拦截
  | "server" // 5xx
  | "network"
  | "unknown";

export class ApiError extends Error {
  kind: ApiErrorKind;
  status?: number;

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

export const ERROR_HINTS: Record<ApiErrorKind, string> = {
  "invalid-image": "请选择有效的 PNG、JPEG 或 WebP 图片。",
  "image-too-large": "请选择小于 50 MiB 的非空图片。",
  "too-many-images": "最多添加 16 张输入图片。",
  "source-unavailable": "来源图片不可用，无法继续编辑",
  "save-failed":
    "图片已生成，但本地保存失败。结果暂存在内存，可查看或下载；离开前会再次确认。",
  auth: "API Key 无效或已失效，请在设置中检查。",
  "org-unverified":
    "组织尚未完成图片模型的资格验证（organization verification）。",
  "rate-limit": "请求过于频繁，稍等片刻再试。",
  "content-policy": "画面描述可能包含受限制的内容，调整描述后重试。",
  server: "服务端暂时不可用，请稍后重试。",
  network: "网络错误：无法连接到 API 地址，请检查网络或中转站配置。",
  unknown: "生成失败，请重试。",
};

/** 错误提示标题（FR-8，toast 反馈） */
export const ERROR_TITLES: Record<ApiErrorKind, string> = {
  "invalid-image": "图片无法读取",
  "image-too-large": "图片大小不符合要求",
  "too-many-images": "输入图片已达上限",
  "source-unavailable": "来源图片不可用",
  "save-failed": "本地保存失败",
  auth: "API Key 无效",
  "org-unverified": "组织未完成验证",
  "rate-limit": "请求过于频繁",
  "content-policy": "生成被内容政策拦截",
  server: "服务端暂时不可用",
  network: "无法连接到 API 地址",
  unknown: "生成失败",
};
