/** IndexedDB：图片 Blob 与生成历史（技术栈文档 §3.3） */
import Dexie, { type EntityTable } from "dexie";
import type {
  EditSource,
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
  editSource?: EditSource; // 兼容旧单图历史
  inputSources?: InputSource[];
  inputFidelity?: InputFidelity;
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
