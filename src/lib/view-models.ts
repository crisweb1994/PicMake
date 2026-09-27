import type { HistoryRow } from "../db/schema";
import type { SizeSpec } from "./types";

export interface DisplayImage {
  id: string;
  url: string;
}

/** 生成中占位布局：本次请求的张数与尺寸（决定占位卡比例） */
export interface GenPlan {
  n: number;
  size: SizeSpec;
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

export interface DisplayInput {
  id: string;
  name: string;
  label: string;
  url?: string;
  /** 草图附件：点击重开画板而非预览 */
  isSketch?: boolean;
  /** ✎ 入口角色：mask=底图；ref=重绘中参考图（停用）；candidate=普通图 */
  inpaintRole?: "mask" | "ref" | "candidate";
}

/** 创作条的局部重绘投影 */
export interface InpaintBarInfo {
  /** 输出目标尺寸 */
  tw: number;
  th: number;
  /** 目标 ≠ 底图原尺寸：需要用户接受 */
  suggested: boolean;
  accepted: boolean;
  reason: string;
}
