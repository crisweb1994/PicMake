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
}

export interface DisplayInput {
  id: string;
  name: string;
  label: string;
  url?: string;
  origin?: string;
}
