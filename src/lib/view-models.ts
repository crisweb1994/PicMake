import type { HistoryRow } from "../db/schema";
import type { SizeReason } from "./inpaint";
import type { ApiErrorKind, PixelSize, SizeSpec } from "./types";

export interface DisplayImage {
  id: string;
  url: string;
  /** 图片实际格式（png / jpeg / webp），决定下载扩展名 */
  format: string;
  /** 图片宽高（多尺寸记录里是保存时读到的实际尺寸；auto 的旧记录为 0） */
  width: number;
  height: number;
}

/** 生成中占位布局：本次请求的张数与尺寸（决定占位卡比例）；多尺寸时 sizes 是各请求的尺寸 */
export interface GenPlan {
  n: number;
  size: SizeSpec;
  sizes?: PixelSize[];
}

/** 多尺寸生成中一格（一个比例的请求）的展示数据；URL 由 hooks 生成 */
export interface DisplaySlot {
  size: PixelSize;
  status: "running" | "done" | "failed";
  /** 渐进预览或终稿的 URL */
  url: string | null;
  /** 失败时的错误种类，舞台上显示它的标题 */
  failure: ApiErrorKind | null;
}

export interface DisplayGen {
  row: HistoryRow;
  images: DisplayImage[];
}

export interface ConfirmState {
  title: string;
  desc: string;
  onOk: () => void;
  /** 自定义按钮文案（缺省「取消 / 继续」）；画板放弃修改等场景使用 */
  okLabel?: string;
  cancelLabel?: string;
}

/** 输入来源的名字：只记种类与必要参数，文案由界面按当前语言生成（记录里保存的系统名不再使用） */
export type InputNaming =
  /** 用户上传的文件名 */
  | { kind: "file"; fileName: string }
  | { kind: "sketch" }
  /** 已有作品；workIndex 为它在来源记录里的序号（从 1 起），来源记录已删除时未知 */
  | { kind: "work"; workIndex?: number }
  /** 局部重绘的底图 */
  | { kind: "base" };

export interface DisplayInput {
  id: string;
  /** 在输入列表里的序号（从 0 起），决定「图N」 */
  index: number;
  naming: InputNaming;
  url?: string;
  /** 草图附件：点击重开画板而非预览 */
  isSketch?: boolean;
  /** ✎ 入口角色：mask=底图；ref=重绘中参考图（停用）；candidate=普通图 */
  inpaintRole?: "mask" | "ref" | "candidate";
}

/** 来源图片在来源记录里的序号（从 1 起）；记录或图片不存在时为 undefined */
export function workIndexOf(
  rows: readonly { id: string; imageIds: readonly string[] }[],
  generationId: string | undefined,
  imageId: string,
): number | undefined {
  const at = rows
    .find((row) => row.id === generationId)
    ?.imageIds.indexOf(imageId);
  return at !== undefined && at >= 0 ? at + 1 : undefined;
}

/** 输入来源的名字种类。顺序即优先级：草图 → 局部重绘底图 → 已有作品 → 用户文件名；
 *  都不是（旧数据没有名字）按已有作品处理 */
export function inputNaming(
  source: { name?: string; generationId?: string },
  ctx: { sketch: boolean; base: boolean; workIndex?: number },
): InputNaming {
  if (ctx.sketch) return { kind: "sketch" };
  if (ctx.base) return { kind: "base" };
  if (source.generationId) return { kind: "work", workIndex: ctx.workIndex };
  if (source.name) return { kind: "file", fileName: source.name };
  return { kind: "work" };
}

/** 创作条的局部重绘投影 */
export interface InpaintBarInfo {
  /** 输出目标尺寸 */
  tw: number;
  th: number;
  /** 目标 ≠ 底图原尺寸：需要用户接受 */
  suggested: boolean;
  accepted: boolean;
  reason: SizeReason;
}
