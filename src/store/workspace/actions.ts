/** 工作区迁移函数：按事件命名，可跨切片、一次 set 完成；组件、hooks 与 flows 只通过这里写入 */
import type { HistoryRow, ImageRow } from "../../db/schema";
import type { PreparedGeneration } from "../../lib/generation";
import { inpaintTargetSize } from "../../lib/inpaint";
import { formSize, paramsToForm, type GenForm } from "../../lib/params";
import {
  ERROR_HINTS,
  MAX_INPUT_IMAGES,
  type FidelityChoice,
  type GenParams,
  type InpaintDraft,
  type InpaintEntry,
  type InputImage,
  type MaskImage,
} from "../../lib/types";
import type { ConfirmState, GenPlan } from "../../lib/view-models";
import { nextSelection } from "../../lib/workspace-rules";
import { useWorkspace, type ViewMask, type WorkspaceState } from "./index";

const set = useWorkspace.setState;
const setDraft = (patch: Partial<WorkspaceState["draft"]>) =>
  set((s) => ({ draft: { ...s.draft, ...patch } }));
const setNav = (patch: Partial<WorkspaceState["nav"]>) =>
  set((s) => ({ nav: { ...s.nav, ...patch } }));
const setView = (patch: Partial<WorkspaceState["view"]>) =>
  set((s) => ({ view: { ...s.view, ...patch } }));

/** 启动时调用：未配置 apiKey 则打开设置 */
export const initWorkspace = (opts: { settingsOpen: boolean }) =>
  setView({ settingsOpen: opts.settingsOpen });

/* ── history ── */

/** liveQuery 回推：更新列表，并在同一次 set 里处理首次自动选中与删除回退 */
export const rowsLoaded = (rows: HistoryRow[]) =>
  set((s) => ({
    history: { ...s.history, rows },
    nav: {
      ...s.nav,
      selectedId: nextSelection(
        s.history.rows ?? undefined,
        rows,
        s.nav.selectedId,
      ),
    },
  }));

/* ── draft ── */

/** 新草稿：给参数就整体替换，否则保留参数只清空描述；同时让进行中的上传读取失效 */
export const initializeDraft = (
  params?: GenParams,
  inputs: InputImage[] = [],
) => set((s) => ({ draft: freshDraft(s.draft, params, inputs) }));

function freshDraft(
  current: WorkspaceState["draft"],
  params?: GenParams,
  inputs: InputImage[] = [],
): WorkspaceState["draft"] {
  return {
    form: params ? paramsToForm(params) : { ...current.form, prompt: "" },
    inputs,
    inpaint: null,
    sizeAccepted: false,
    inputFidelity: "auto",
    dirty: false,
    readId: null,
    uploadError: "",
  };
}

export const patchForm = (patch: Partial<GenForm>) =>
  set((s) => ({
    draft: { ...s.draft, form: { ...s.draft.form, ...patch }, dirty: true },
  }));

export const setInputFidelity = (inputFidelity: FidelityChoice) =>
  setDraft({ inputFidelity, dirty: true });

export const acceptSize = () => setDraft({ sizeAccepted: true });

/** 开始读取一批上传 */
export const beginRead = (readId: string) =>
  setDraft({ readId, uploadError: "" });

/** 第一批输入图：比例改为 auto */
const withFirstInputs = (draft: WorkspaceState["draft"]): GenForm =>
  draft.inputs.length
    ? draft.form
    : { ...draft.form, ratio: "auto", cw: "", ch: "" };

/** 读取完成：批次已失效（读取中移除图片、切换记录等）时忽略并返回 false；超出上限的图片不添加 */
export function finishRead(
  readId: string,
  added: InputImage[],
  errors: string[],
): boolean {
  const { draft } = useWorkspace.getState();
  if (draft.readId !== readId) return false;
  const kept = added.slice(
    0,
    Math.max(0, MAX_INPUT_IMAGES - draft.inputs.length),
  );
  const skipped = added.length - kept.length;
  const messages = skipped
    ? [
        ...errors,
        `${ERROR_HINTS["too-many-images"]}本次添加 ${kept.length} 张，${skipped} 张未添加。`,
      ]
    : errors;
  set((s) => ({
    draft: {
      ...s.draft,
      ...(kept.length
        ? {
            inputs: [...s.draft.inputs, ...kept],
            form: withFirstInputs(s.draft),
            dirty: true,
          }
        : {}),
      uploadError: messages.join("\n"),
      readId: null,
    },
  }));
  return true;
}

/** 移除输入图；移除的是底图时连带移除选区（不留无底图的重绘状态），并让进行中的读取失效 */
export function removeDraftInput(id: string): "base-and-mask" | "renumbered" {
  const { draft } = useWorkspace.getState();
  const withMask = !!draft.inpaint && draft.inputs[0]?.imageId === id;
  setDraft({
    readId: null,
    inputs: draft.inputs.filter((input) => input.imageId !== id),
    ...(withMask ? { inpaint: null, sizeAccepted: false } : {}),
    dirty: true,
    uploadError: "",
  });
  return withMask ? "base-and-mask" : "renumbered";
}

/** 移除选区：保留底图与描述，切换为普通图片编辑 */
export const removeDraftMask = () =>
  setDraft({ inpaint: null, sizeAccepted: false, dirty: true });

/** 选区确认：draft-input 把底图重排为图1 并移除被选中的原图；result 由 initializeDraft 就位、reedit 底图已在位 */
export function applyInpaintToDraft(
  payload: {
    base: ImageRow;
    mask: MaskImage;
    original?: InpaintDraft["original"];
    entry: InpaintEntry;
  },
  chosenInputId?: string,
) {
  const target =
    payload.entry === "reedit"
      ? undefined
      : inpaintTargetSize(payload.mask.width, payload.mask.height);
  set((s) => ({
    draft: {
      ...s.draft,
      inputs:
        payload.entry === "draft-input"
          ? [
              { imageId: payload.base.id, name: "底图", upload: payload.base },
              ...s.draft.inputs.filter(
                (input) =>
                  input.imageId !== chosenInputId &&
                  input.imageId !== payload.base.id,
              ),
            ]
          : s.draft.inputs,
      ...(payload.entry === "reedit"
        ? {}
        : { sizeAccepted: target ? !target.suggested : false }),
      inpaint: { mask: payload.mask, original: payload.original },
      dirty: true,
    },
  }));
}

/** 设为参考图：追加已有结果为输入源，不打断当前草稿 */
export function appendExisting(
  imageId: string,
  generationId: string | undefined,
  name: string,
): "duplicate" | "too-many" | "added" {
  const { draft } = useWorkspace.getState();
  if (draft.inputs.some((input) => input.imageId === imageId))
    return "duplicate";
  if (draft.inputs.length >= MAX_INPUT_IMAGES) return "too-many";
  set((s) => ({
    draft: {
      ...s.draft,
      inputs: [...s.draft.inputs, { imageId, generationId, name }],
      form: withFirstInputs(s.draft),
      dirty: true,
    },
  }));
  return "added";
}

/** 草图落附件并展开创作条：原位替换或追加；第一次加草图且尺寸为 auto 时改用草图尺寸，描述为空时填入起始文字 */
export function applySketchAttachment(
  image: ImageRow,
  replaces: string | null,
): { ok: false } | { ok: true; sizeSetTo: { w: number; h: number } | null } {
  const { draft } = useWorkspace.getState();
  const target =
    replaces ??
    draft.inputs.find((input) => input.upload?.sketch)?.imageId ??
    null;
  if (!target && draft.inputs.length >= MAX_INPUT_IMAGES) return { ok: false };
  const attachment: InputImage = {
    imageId: image.id,
    name: "草图",
    upload: image,
  };
  const setSize =
    !replaces && draft.inputs.length === 0 && formSize(draft.form) === "auto";
  const seedPrompt = !replaces && !draft.form.prompt.trim();
  set((s) => ({
    draft: {
      ...s.draft,
      inputs: target
        ? s.draft.inputs.map((input) =>
            input.imageId === target ? attachment : input,
          )
        : [...s.draft.inputs, attachment],
      form: {
        ...s.draft.form,
        ...(setSize
          ? { cw: String(image.width), ch: String(image.height) }
          : {}),
        ...(seedPrompt
          ? {
              prompt: `以图${draft.inputs.length + 1}的草图为构图参考，保留主体的相对位置与比例，将粗略线条转成完整画面。`,
            }
          : {}),
      },
      dirty: true,
    },
    view: { ...s.view, barMode: "full", focusSeq: s.view.focusSeq + 1 },
  }));
  return {
    ok: true,
    sizeSetTo: setSize ? { w: image.width, h: image.height } : null,
  };
}

/* ── run ── */

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

/** 删除完成：刚保存的那条被删时丢弃过渡结果，列表没回推时也不再从内存显示它 */
export const recordDeleted = (id: string) =>
  set((s) =>
    s.history.recent?.row.id === id
      ? { history: { ...s.history, recent: null } }
      : s,
  );

/** 离开类入口共用的复位：完成标记、返回目标、草稿（保留参数）、查看状态；传 selectId 时同时切换选中。不改生成阶段：未保存结果由 requestLeave 确认后丢弃 */
export const resetWorkspace = (selectId?: string | null) =>
  set((s) => ({
    nav: {
      selectedId: selectId === undefined ? s.nav.selectedId : selectId,
      returnId: null,
      lastDoneId: null,
    },
    draft: freshDraft(s.draft),
    view: { ...s.view, focusIdx: null, lightboxId: null, previewId: null },
  }));

/* ── nav ── */

export const selectRecord = (id: string | null) => setNav({ selectedId: id });
export const setReturnId = (id: string | null) => setNav({ returnId: id });
export const setLastDoneId = (id: string | null) => setNav({ lastDoneId: id });
export const clearDone = () => setNav({ lastDoneId: null });

/* ── view ── */

/** 查看状态复位：轮播、灯箱、预览 */
export const resetView = () =>
  setView({ focusIdx: null, lightboxId: null, previewId: null });

/** 展开创作条并请求聚焦描述框 */
export const openBar = () =>
  set((s) => ({
    view: { ...s.view, barMode: "full", focusSeq: s.view.focusSeq + 1 },
  }));

export const setBarMode = (barMode: "mini" | "full") => setView({ barMode });

export const requestPromptFocus = () =>
  set((s) => ({ view: { ...s.view, focusSeq: s.view.focusSeq + 1 } }));

export const setFocusIdx = (focusIdx: number | null) => setView({ focusIdx });
export const openLightbox = (id: string) => setView({ lightboxId: id });
export const closeLightbox = () => setView({ lightboxId: null });
export const setPreviewId = (previewId: string | null) =>
  setView({ previewId });
export const openDrawer = () => setView({ drawerOpen: true });
export const closeDrawer = () => setView({ drawerOpen: false });
export const openSettings = () => setView({ settingsOpen: true });
export const closeSettings = () => setView({ settingsOpen: false });
export const showViewMask = (viewMask: ViewMask) => setView({ viewMask });
export const closeViewMask = () => setView({ viewMask: null });

/* ── confirm ── */

export const setConfirm = (confirm: ConfirmState) => set({ confirm });
export const closeConfirm = () => set({ confirm: null });
