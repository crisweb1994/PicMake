/** IndexedDB：图片 Blob 与生成历史（技术栈文档 §3.3） */
import Dexie, { type EntityTable } from "dexie";
import type {
  GenParams,
  Usage,
  InputSource,
  InputFidelity,
} from "../lib/types";

export interface ImageRow {
  id: string;
  blob: Blob;
  width: number;
  height: number;
  format: string;
}

export interface HistoryRow {
  id: string;
  prompt: string;
  params: GenParams;
  usage: Usage | null;
  imageIds: string[];
  createdAt: number;
  inputSources?: InputSource[];
  inputFidelity?: InputFidelity;
  /** 编辑/参考图生成的原始描述（首个输入源记录的 prompt，链路取最初；PRD 2026-09-23） */
  originPrompt?: string;
  /** 用户收藏标记（2026-09-23，市场调研基线维度）：缺省视为未收藏，无索引、内存过滤 */
  starred?: boolean;
  durationMs: number;
}

export const db = new Dexie("PicMake") as Dexie & {
  images: EntityTable<ImageRow, "id">;
  history: EntityTable<HistoryRow, "id">;
};

db.version(1).stores({
  images: "id",
  history: "id, createdAt",
});

/** 启动时申请持久化存储，降低浏览器自动清理 IndexedDB 的风险 */
export async function ensurePersistentStorage(): Promise<void> {
  try {
    await navigator.storage.persist();
  } catch {
    /* 不支持则忽略 */
  }
}
