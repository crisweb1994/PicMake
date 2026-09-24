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
  origin?: string;
  /** 草图附件：点击重新打开画板而非普通预览（SKETCH §6.3） */
  isSketch?: boolean;
}
