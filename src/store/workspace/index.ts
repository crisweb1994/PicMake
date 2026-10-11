/** 工作区共享状态（会话内，不持久化）：只放数据与 Blob / ImageRow，不存 Object URL；写入只经 actions.ts 的命名迁移函数 */
import { create } from "zustand";
import type { HistoryRow, ImageRow } from "../../db/schema";
import type { PreparedGeneration } from "../../lib/generation";
import { DEFAULT_FORM, type GenForm } from "../../lib/params";
import type {
  FidelityChoice,
  InpaintDraft,
  InputImage,
  MaskCommand,
} from "../../lib/types";
import type { ConfirmState, GenPlan } from "../../lib/view-models";

/** 生成生命周期；saving = 请求成功、正在写库，unsaved = 保存失败、结果留在内存（可查看、下载） */
export type Run =
  | { phase: "idle" }
  | {
      phase: "generating";
      plan: GenPlan;
      partial: { blob: Blob; index: number } | null;
    }
  | { phase: "saving"; prepared: PreparedGeneration }
  | { phase: "unsaved"; prepared: PreparedGeneration };

/** 只读查看选区：底图 URL 由页面从 base.blob 生成 */
export interface ViewMask {
  base: ImageRow;
  name: string;
  commands: MaskCommand[];
  rowId: string;
}

export interface WorkspaceState {
  history: {
    /** 只由 liveQuery 订阅（flows/history-sync）写入；null 表示尚未加载 */
    rows: HistoryRow[] | null;
    /** 刚保存的那次生成：列表回推前用它过渡显示；展示它期间沿用同一组图片 URL，保存前后不闪空。下次开始生成时清空 */
    recent: PreparedGeneration | null;
  };
  run: Run;
  /** 一次提交的草稿：文字、参数与输入图；局部重绘时底图恒为 inputs[0] */
  draft: {
    form: GenForm;
    inputs: InputImage[];
    inpaint: InpaintDraft | null;
    /** 建议尺寸是否已接受：仅对当前底图与目标尺寸有效 */
    sizeAccepted: boolean;
    inputFidelity: FidelityChoice;
    /** 自上次初始化以来用户是否改过草稿 */
    dirty: boolean;
    /** 正在读取的上传批次；非 null 即读取中 */
    readId: string | null;
    uploadError: string;
  };
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
  history: { rows: null, recent: null },
  run: { phase: "idle" },
  draft: {
    form: DEFAULT_FORM,
    inputs: [],
    inpaint: null,
    sizeAccepted: false,
    inputFidelity: "auto",
    dirty: false,
    readId: null,
    uploadError: "",
  },
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
