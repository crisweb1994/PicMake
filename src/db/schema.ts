/** IndexedDB：图片 Blob 与生成历史（技术栈文档 §3.3） */
import Dexie, { type EntityTable } from "dexie";
import type {
  GenParams,
  Usage,
  InputSource,
  FidelityChoice,
  SketchDocument,
} from "../lib/types";

export interface ImageRow {
  id: string;
  blob: Blob;
  width: number;
  height: number;
  format: string;
  /** 草图附件的可重放命令文档（SKETCH §8.1）；普通图片没有该字段。
   *  可选非索引字段，旧图片行按普通图片处理，无需升级 Dexie store。 */
  sketch?: SketchDocument;
}

export interface HistoryRow {
  id: string;
  prompt: string;
  params: GenParams;
  usage: Usage | null;
  imageIds: string[];
  createdAt: number;
  inputSources?: InputSource[];
  /** 提交时的保真度选择：auto = 未发送 input_fidelity（旧记录为 low/high） */
  inputFidelity?: FidelityChoice;
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
