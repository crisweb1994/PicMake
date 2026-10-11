/** 导航流程：切换记录、新建、返回结果、复用参数、编辑此图、调整上次重绘、删除、收藏、设为参考图 */
import { toast } from "@heroui/react";
import { deleteHistory, toggleStar as toggleStarRow } from "../db/history";
import { ERROR_HINTS } from "../lib/types";
import { hasUserWork, leaveDecision } from "../lib/workspace-rules";
import { useWorkspace } from "../store/workspace";
import {
  acceptSize,
  appendExisting,
  applyInpaintToDraft,
  clearDone,
  discardUnsaved,
  initializeDraft,
  openBar,
  recordDeleted,
  resetView,
  resetWorkspace,
  selectRecord,
  setBarMode,
  setConfirm,
  setReturnId,
} from "../store/workspace/actions";
import {
  findRow,
  selectDisplayRow,
  selectSelectedImageId,
} from "../store/workspace/selectors";
import { readInpaintDraft, toastError } from "./generate";

/** 延迟回调（确认之后、await 之后）按当前状态复核：已开始生成或正在保存时不再执行 */
function busyNow(): boolean {
  const { phase } = useWorkspace.getState().run;
  return phase === "generating" || phase === "saving";
}

/** 离开或替换当前结果/草稿：规则见 leaveDecision；usesDisplayed = 以展示中的记录为来源 */
export function requestLeave(onLeave: () => void, usesDisplayed = false) {
  const { run, draft } = useWorkspace.getState();
  const decision = leaveDecision({
    run: run.phase,
    userWork: hasUserWork({
      dirty: draft.dirty,
      reading: draft.readId !== null,
    }),
    usesDisplayed,
  });
  if (decision === "blocked") return;
  if (decision === "confirm-unsaved") {
    setConfirm({
      title: "放弃未保存结果？",
      desc: "图片已经生成，但尚未保存到本机。离开后这次结果会丢失。",
      onOk: () => {
        if (busyNow()) return;
        discardUnsaved();
        onLeave();
      },
    });
    return;
  }
  if (decision === "confirm-draft") {
    setConfirm({
      title: "放弃当前草稿？",
      desc: "未提交的修改将被放弃。",
      onOk: () => {
        if (!busyNow()) onLeave();
      },
    });
    return;
  }
  onLeave();
}

export function selectHistory(id: string) {
  requestLeave(() => resetWorkspace(id));
}

export function newGeneration() {
  requestLeave(() => resetWorkspace(null));
}

export function returnToResult() {
  const { returnId } = useWorkspace.getState().nav;
  if (!returnId) return;
  requestLeave(() => resetWorkspace(returnId));
}

export function reuseParams(id: string) {
  const row = findRow(useWorkspace.getState(), id);
  if (!row) return;
  requestLeave(() => {
    clearDone();
    initializeDraft(row.params);
    selectRecord(null);
    setReturnId(null);
    resetView();
    openBar();
    toast("参数已回填，可直接生成");
  });
}

export function editImage(imageId: string) {
  // 请求时确定来源记录：确认框之后执行时不再重新推断
  const row = selectDisplayRow(useWorkspace.getState());
  if (!row) return;
  requestLeave(() => {
    clearDone();
    initializeDraft({ ...row.params, prompt: "" }, [
      {
        generationId: row.id,
        imageId,
        name: `已有作品 · 第 ${row.imageIds.indexOf(imageId) + 1} 张`,
      },
    ]);
    setReturnId(row.id);
    selectRecord(null);
    resetView();
    openBar();
  }, true);
}

/** 调整上次重绘：恢复为可编辑草稿，不生成 */
export function adjustInpaint(id: string) {
  const row = findRow(useWorkspace.getState(), id);
  if (!row) return;
  requestLeave(async () => {
    clearDone();
    const read = await readInpaintDraft(row);
    if (busyNow()) return;
    if (!read.ok) {
      toast(`${read.missing}不可用，无法恢复上次重绘`);
      return;
    }
    // 恢复为已确认草稿：接受状态沿用已保存目标（约束变化在生成前重新复核）
    initializeDraft(read.params, read.draft.inputs);
    applyInpaintToDraft({
      base: read.draft.inputs[0].upload!,
      mask: read.mask,
      original: read.draft.inpaint?.original,
      entry: "reedit",
    });
    acceptSize();
    selectRecord(null);
    setReturnId(null);
    resetView();
    openBar();
    toast("已恢复上次重绘，可继续调整后生成");
  }, true);
}

export function deleteRecord(id: string) {
  const state = useWorkspace.getState();
  const row = findRow(state, id);
  if (state.run.phase !== "idle" || !row) return;
  // 请求时确定是否删的是当前记录：liveQuery 可能先于删除完成回推并回退选中
  const wasCurrent = state.nav.selectedId === id;
  setConfirm({
    title: "删除这次生成？",
    desc: `包含 ${row.imageIds.length} 张图片，删除后无法恢复。`,
    onOk: () => {
      if (busyNow()) return;
      void deleteHistory(id)
        .then(() => {
          toast("已删除");
          recordDeleted(id);
          // 删除期间已开始生成：草稿属于这次生成，不再复位
          if (wasCurrent && !busyNow()) resetWorkspace();
        })
        .catch((caught) => toastError(caught));
    },
  });
}

/** 记录不存在时静默忽略（如未保存的结果） */
export function toggleStar(id: string) {
  void toggleStarRow(id);
}

/** 设为参考图：把展示记录中选中的那张（或第一张）追加为输入，不打断当前草稿 */
export function addAsReference() {
  const state = useWorkspace.getState();
  const row = selectDisplayRow(state);
  if (state.run.phase !== "idle" || !row) return;
  const imageId = selectSelectedImageId(state) ?? row.imageIds[0] ?? null;
  if (!imageId) return;
  const added = appendExisting(
    imageId,
    row.id,
    `已有作品 · 第 ${row.imageIds.indexOf(imageId) + 1} 张`,
  );
  if (added === "too-many") toast(ERROR_HINTS["too-many-images"]);
  clearDone();
  setBarMode("full");
  toast("已加入参考图，继续描述后生成");
}
