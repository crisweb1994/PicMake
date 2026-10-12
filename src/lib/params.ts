/** 生成表单 ↔ API 参数映射（纯函数） */
import { validateSize, type SizeIssue } from "./size";
import type {
  Background,
  GenParams,
  ModelId,
  OutputFormat,
  Quality,
  SizeSpec,
} from "./types";

export type RatioId =
  "1:1" | "4:3" | "3:4" | "3:2" | "2:3" | "16:9" | "9:16" | "auto";

/** 模型显示名是品牌名，不随语言变化 */
export const MODEL_LABELS: Record<ModelId, string> = {
  flare: "Flare",
  sunburst: "Sunburst",
};

/** 比例 chip 的顺序；「auto」的显示名随语言，见 i18n/labels.ts */
export const RATIOS: ReadonlyArray<RatioId> = [
  "1:1",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "16:9",
  "9:16",
  "auto",
];

/** 各比例的基准像素 */
export const RATIO_DIMS: Record<Exclude<RatioId, "auto">, [number, number]> = {
  "1:1": [1024, 1024],
  "4:3": [1360, 1024],
  "3:4": [1024, 1360],
  "3:2": [1536, 1024],
  "2:3": [1024, 1536],
  "16:9": [1792, 1008],
  "9:16": [1008, 1792],
};

export interface GenForm {
  model: ModelId;
  prompt: string;
  ratio: Exclude<RatioId, "auto"> | "auto";
  /** 基准分辨率：比例生效时决定实际像素（自动尺寸下无效） */
  base: BaseRes;
  cw: string;
  ch: string;
  quality: Quality;
  n: number;
  bg: Background;
  fmt: OutputFormat;
}

export type BaseRes = "1k" | "2k" | "4k";

export const BASE_LABELS: ReadonlyArray<{ id: BaseRes; label: string }> = [
  { id: "1k", label: "1K" },
  { id: "2k", label: "2K" },
  { id: "4k", label: "4K" },
];

export const DEFAULT_FORM: GenForm = {
  model: "flare",
  prompt: "",
  ratio: "3:2",
  base: "1k",
  cw: "",
  ch: "",
  quality: "high",
  n: 1,
  bg: "auto",
  fmt: "png",
};

export function isCustomActive(f: Pick<GenForm, "cw" | "ch">): boolean {
  return f.cw !== "" || f.ch !== "";
}

/** 自定义宽高是否合法（不激活时恒合法） */
export function customOk(f: Pick<GenForm, "cw" | "ch">): boolean {
  if (!isCustomActive(f)) return true;
  const w = parseDimension(f.cw);
  const h = parseDimension(f.ch);
  return w !== null && h !== null && validateSize(w, h).length === 0;
}

function parseDimension(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** 表单 → 尺寸：自定义合法时优先；比例 × 基准分辨率次之；auto 交给 API */
export function formSize(
  f: Pick<GenForm, "ratio" | "base" | "cw" | "ch">,
): SizeSpec {
  if (isCustomActive(f) && customOk(f)) {
    return { w: Number(f.cw), h: Number(f.ch) };
  }
  if (f.ratio === "auto") return "auto";
  const [w, h] = RATIO_DIMS[f.ratio];
  return scaleDims(w, h, f.base);
}

/** 按基准分辨率缩放 1K 基准尺寸，保持 /16 整除并夹在 3840 × 2160 内 */
function scaleDims(
  w: number,
  h: number,
  base: BaseRes,
): { w: number; h: number } {
  if (base === "1k") return { w, h };
  if (base === "2k") return { w: w * 2, h: h * 2 };
  // 4K：等比放进 3840 × 2160 的框里
  const s = Math.min(3840 / w, 2160 / h);
  const round16 = (n: number) =>
    Math.min(3840, Math.max(256, Math.round(n / 16) * 16));
  return { w: round16(w * s), h: round16(h * s) };
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
  };
}

/** 复用参数：历史记录 → 表单（具体尺寸回填到自定义宽高） */
export function paramsToForm(p: GenParams): GenForm {
  const size: SizeSpec = p.size;
  return {
    ...DEFAULT_FORM,
    model: p.model,
    prompt: p.prompt,
    ratio: size === "auto" ? "auto" : "3:2",
    cw: size === "auto" ? "" : String(size.w),
    ch: size === "auto" ? "" : String(size.h),
    quality: p.quality,
    n: p.n,
    bg: p.background,
    fmt: p.outputFormat,
  };
}

/** 请求参数的问题码；界面文案见 i18n 资源 issues.* */
export type ParamIssue = "empty-prompt" | SizeIssue;

export function validateParams(p: GenParams): ParamIssue[] {
  const issues: ParamIssue[] = [];
  if (!p.prompt.trim()) issues.push("empty-prompt");
  if (p.size !== "auto") issues.push(...validateSize(p.size.w, p.size.h));
  return [...new Set(issues)];
}
