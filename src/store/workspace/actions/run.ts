/** 生成生命周期迁移函数：占位、partial、保存、未保存 */
import type { PreparedGeneration } from "../../../lib/generation";
import type { GenPlan } from "../../../lib/view-models";
import { useWorkspace } from "../index";
import { set, freshDraft } from "./internal";

/** 开始生成：只有空闲时能占位，判断与写入同步完成；同时清空选中、完成标记、过渡结果与查看状态 */
export function beginRun(plan: GenPlan): boolean {
  if (useWorkspace.getState().run.phase !== "idle") return false;
  set((s) => ({
    run: { phase: "generating", plan, partial: null },
    history: { ...s.history, recent: null },
    nav: { ...s.nav, selectedId: null, lastDoneId: null },
    view: { ...s.view, focusIdx: null, lightboxId: null, previewId: null },
  }));
  return true;
}

/** partial 预览：只在生成中更新，取消后才到达的直接忽略 */
export const setPartial = (blob: Blob, index: number) =>
  set((s) =>
    s.run.phase === "generating"
      ? { run: { ...s.run, partial: { blob, index } } }
      : s,
  );

/** 生成结束于取消或失败：回到空闲，草稿保留 */
export const endRun = () =>
  set((s) => (s.run.phase === "generating" ? { run: { phase: "idle" } } : s));

/** 请求成功、开始写库：结果先在舞台展示 */
export const beginSave = (prepared: PreparedGeneration) =>
  set({ run: { phase: "saving", prepared } });

/** 写库失败：结果留在内存，可查看、下载；离开前需确认放弃 */
export const markUnsaved = () =>
  set((s) =>
    s.run.phase === "saving"
      ? { run: { phase: "unsaved", prepared: s.run.prepared } }
      : s,
  );

/** 放弃未保存的结果 */
export const discardUnsaved = () =>
  set((s) => (s.run.phase === "unsaved" ? { run: { phase: "idle" } } : s));

/** 保存成功：选中新记录并进入 complete 态，草稿重置（保留参数）；列表回推前由 recent 过渡显示 */
export const finishSave = (prepared: PreparedGeneration) =>
  set((s) => ({
    run: { phase: "idle" },
    history: { ...s.history, recent: prepared },
    nav: {
      selectedId: prepared.row.id,
      returnId: null,
      lastDoneId: prepared.row.id,
    },
    draft: freshDraft(s.draft),
  }));
