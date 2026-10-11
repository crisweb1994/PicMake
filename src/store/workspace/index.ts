/** 工作区共享状态（会话内，不持久化）：只放数据与 Blob / ImageRow，不存 Object URL；写入只经 actions.ts 的命名迁移函数 */
import { create } from "zustand";
import type { ImageRow } from "../../db/schema";
import type { MaskCommand } from "../../lib/types";
import type { ConfirmState } from "../../lib/view-models";

/** 只读查看选区：底图 URL 由页面从 base.blob 生成 */
export interface ViewMask {
  base: ImageRow;
  name: string;
  commands: MaskCommand[];
  rowId: string;
}

export interface WorkspaceState {
  nav: {
    selectedId: string | null;
    /** "编辑此图"进入草稿前展示的记录，供"返回结果" */
    returnId: string | null;
    /** 最近保存成功的记录：与展示记录一致时底栏为 complete 态 */
    lastDoneId: string | null;
  };
  view: {
    barMode: "mini" | "full";
    /** 聚焦描述框的意图计数：变化时由页面聚焦 */
    focusSeq: number;
    previewId: string | null;
    /** 轮播当前序号 */
    focusIdx: number | null;
    lightboxId: string | null;
    drawerOpen: boolean;
    settingsOpen: boolean;
    viewMask: ViewMask | null;
  };
  confirm: ConfirmState | null;
}

export const initialWorkspace = (): WorkspaceState => ({
  nav: { selectedId: null, returnId: null, lastDoneId: null },
  view: {
    barMode: "mini",
    focusSeq: 0,
    previewId: null,
    focusIdx: null,
    lightboxId: null,
    drawerOpen: false,
    settingsOpen: false,
    viewMask: null,
  },
  confirm: null,
});

export const useWorkspace = create<WorkspaceState>()(initialWorkspace);
