/** 草稿迁移函数：描述与参数、输入图、选区、草图附件 */
import type { ImageRow } from "../../../db/schema";
import { formSize, type GenForm } from "../../../lib/params";
import {
  ERROR_HINTS,
  MAX_INPUT_IMAGES,
  type FidelityChoice,
  type GenParams,
  type InputImage,
} from "../../../lib/types";
import { useWorkspace, type WorkspaceState } from "../index";
import {
  set,
  setDraft,
  freshDraft,
  withInpaint,
  type InpaintPayload,
} from "./internal";

/** 新草稿：给参数就整体替换，否则保留参数只清空描述；同时让进行中的上传读取失效 */
export const initializeDraft = (
  params?: GenParams,
  inputs: InputImage[] = [],
) => set((s) => ({ draft: freshDraft(s.draft, params, inputs) }));

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

/** 把选区放进草稿（恢复上次重绘时用）；画板确认走 applyInpaintSelection */
export const applyInpaintToDraft = (
  payload: InpaintPayload,
  chosenInputId?: string,
) => set((s) => ({ draft: withInpaint(s.draft, payload, chosenInputId) }));

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
