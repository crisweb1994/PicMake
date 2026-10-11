/** 工作区共享状态（会话内，不持久化）：只放数据与 Blob / ImageRow，不存 Object URL；写入只经 actions.ts 的命名迁移函数 */
import { create } from "zustand";
import type { HistoryRow, ImageRow } from "../../db/schema";
import type { PreparedGeneration } from "../../lib/generation";
import { DEFAULT_FORM, type GenForm } from "../../lib/params";
import type {
  FidelityChoice,
  InpaintDraft,
  InpaintEntry,
  InpaintIssue,
  InputImage,
  InputSource,
  MaskCommand,
  MaskDocument,
  SketchDocument,
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

/** 画板：草图与局部重绘共用一个槽位，互斥由类型保证；opening = 局部重绘底图准备中。
 *  id 在打开时生成，异步结果回来后与当前 id 比对，不一致就丢弃 */
export type Drawing =
  | { kind: "opening"; id: string }
  | {
      kind: "sketch";
      id: string;
      doc: SketchDocument;
      cursor: number;
      /** 编辑已有附件时的原位替换目标；新建、继续历史草图为 null */
      replacesImageId: string | null;
      meta: string;
      /** 打开时的快照键：撤销回这个状态视为没有修改 */
      openKey: string;
      confirming: boolean;
    }
  | {
      kind: "inpaint";
      id: string;
      entry: InpaintEntry;
      /** 实际请求底图（方向归一后）；URL 由页面从 base.blob 生成 */
      base: ImageRow;
      /** 仅发生方向归一时存在：原文件与其来源身份 */
      original?: { source: InputSource; image: ImageRow };
      /** 发生了方向归一化：弹层里提示 */
      normalized: boolean;
      doc: MaskDocument;
      cursor: number;
      /** draft-input 入口被涂选的原输入 id：确认后移除并把底图重排为图1 */
      chosenInputId: string | null;
      name: string;
      openKey: string;
      confirming: boolean;
      /** 就地错误（非 toast） */
      error: InpaintIssue | null;
    };

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
  /** 草图或局部重绘画板；null = 没有打开 */
  drawing: Drawing | null;
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
  drawing: null,
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
