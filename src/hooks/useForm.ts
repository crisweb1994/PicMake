/** 一次提交的草稿：文字、参数与图片。局部重绘附件由本 hook 唯一拥有：底图恒为 inputs[0] */
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@heroui/react";
import {
  customOk,
  DEFAULT_FORM,
  paramsToForm,
  type GenForm,
} from "../lib/params";
import {
  ApiError,
  ERROR_HINTS,
  MAX_INPUT_IMAGES,
  type FidelityChoice,
  type GenParams,
  type InpaintDraft,
  type InpaintEntry,
  type InputImage,
  type MaskImage,
} from "../lib/types";
import { inpaintTargetSize } from "../lib/inpaint";
import { readInputImage } from "../lib/input-images";
import type { ImageRow } from "../db/schema";
import { inputDisplay } from "../lib/view-models";
import { draftToParams, inpaintBarInfo } from "../lib/workspace-rules";
import { useImageAssets } from "./useImageAssets";

export function useForm() {
  const [form, setForm] = useState<GenForm>(DEFAULT_FORM);
  const [inputs, setInputs] = useState<InputImage[]>([]);
  const [inpaint, setInpaint] = useState<InpaintDraft | null>(null);
  /** 尺寸接受状态：仅对当前底图与目标尺寸有效 */
  const [sizeAccepted, setSizeAccepted] = useState(false);
  const [inputFidelity, setFidelity] = useState<FidelityChoice>("auto");
  const [dirty, setDirty] = useState(false);
  const [reading, setReading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const readRef = useRef(0);
  const readingRef = useRef(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const customValid = customOk(form);
  const uploads = useMemo(
    () => inputs.flatMap((input) => (input.upload ? [input.upload] : [])),
    [inputs],
  );
  const { assets } = useImageAssets(
    inputs.map((input) => input.imageId),
    uploads,
  );
  const images = inputs.map((input, index) => ({
    id: input.imageId,
    ...inputDisplay(input.name, index),
    url: assets[input.imageId]?.url,
    isSketch: !!input.upload?.sketch,
    /** ✎ 入口角色：底图=修改选区；重绘中参考图停用；普通图可发起 */
    inpaintRole: inpaint
      ? index === 0
        ? ("mask" as const)
        : ("ref" as const)
      : ("candidate" as const),
  }));
  /** 输出目标与接受状态投影 */
  const inpaintInfo = useMemo(
    () => inpaintBarInfo(inpaint, sizeAccepted),
    [inpaint, sizeAccepted],
  );
  const stopReading = () => {
    readRef.current++;
    readingRef.current = false;
    setReading(false);
  };
  useEffect(
    () => () => {
      readRef.current++;
    },
    [],
  );

  const initialize = (params?: GenParams, nextInputs: InputImage[] = []) => {
    stopReading();
    setForm((current) =>
      params ? paramsToForm(params) : { ...current, prompt: "" },
    );
    setInputs(nextInputs);
    setInpaint(null);
    setSizeAccepted(false);
    setFidelity("auto");
    setDirty(false);
    setUploadError("");
  };
  const patchForm = (patch: Partial<GenForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    setDirty(true);
  };
  const removeInput = (id: string) => {
    stopReading();
    setInputs((current) => current.filter((input) => input.imageId !== id));
    // 移除底图同时移除绑定的选区，不留无底图的重绘状态
    if (inpaint && inputs[0]?.imageId === id) {
      setInpaint(null);
      setSizeAccepted(false);
      toast("已移除底图与选区，剩余图片重新编号，请检查描述");
    } else {
      toast("图片编号已更新，请检查描述中的图序号");
    }
    setDirty(true);
    setUploadError("");
  };
  /** 移除选区：保留底图与描述，切换为普通图片编辑 */
  const removeMask = () => {
    setInpaint(null);
    setSizeAccepted(false);
    setDirty(true);
    toast("已移除选区：保留底图与描述，切换为普通图片编辑");
  };
  /** 选区确认：draft-input 重排底图为图1；result 由 initialize 就位、reedit 底图已在位 */
  const applyInpaint = (
    payload: {
      base: ImageRow;
      mask: MaskImage;
      original?: InpaintDraft["original"];
      entry: InpaintEntry;
    },
    /** draft-input 入口被选中的原输入（重排后移除） */
    chosenInputId?: string,
  ): void => {
    if (payload.entry === "draft-input") {
      setInputs((current) => [
        {
          imageId: payload.base.id,
          name: "底图",
          upload: payload.base,
        },
        ...current.filter(
          (input) =>
            input.imageId !== chosenInputId &&
            input.imageId !== payload.base.id,
        ),
      ]);
    }
    if (payload.entry !== "reedit") {
      const target = inpaintTargetSize(payload.mask.width, payload.mask.height);
      setSizeAccepted(target ? !target.suggested : false);
    }
    setInpaint({ mask: payload.mask, original: payload.original });
    setDirty(true);
  };
  /** 设为参考图：追加已有结果为输入源，不打断当前草稿 */
  const appendExisting = (
    imageId: string,
    generationId: string | undefined,
    name: string,
  ) => {
    if (inputs.some((input) => input.imageId === imageId)) return;
    if (inputs.length >= MAX_INPUT_IMAGES) {
      toast(ERROR_HINTS["too-many-images"]);
      return;
    }
    setInputs((current) => [...current, { imageId, generationId, name }]);
    setDirty(true);
    if (!inputs.length)
      setForm((current) => ({ ...current, ratio: "auto", cw: "", ch: "" }));
  };
  /** 草图落附件：原位替换或追加；校验失败返回 false 由画板保留 */
  const applySketch = (image: ImageRow, replaces: string | null): boolean => {
    const target =
      replaces ?? inputs.find((input) => input.upload?.sketch)?.imageId ?? null;
    if (target) {
      setInputs((current) =>
        current.map((input) =>
          input.imageId === target
            ? { imageId: image.id, name: "草图", upload: image }
            : input,
        ),
      );
      setDirty(true);
      return true;
    }
    if (inputs.length >= MAX_INPUT_IMAGES) {
      toast(ERROR_HINTS["too-many-images"]);
      return false;
    }
    setInputs((current) => [
      ...current,
      { imageId: image.id, name: "草图", upload: image },
    ]);
    setDirty(true);
    return true;
  };
  const addFiles = async (files: File[]) => {
    if (!files.length || readingRef.current) return;
    const token = ++readRef.current;
    readingRef.current = true;
    setReading(true);
    setUploadError("");
    const added: InputImage[] = [],
      errors: string[] = [];
    let skipped = 0;
    for (const file of files) {
      if (token !== readRef.current) return;
      try {
        const image = await readInputImage(file);
        if (inputs.length + added.length >= MAX_INPUT_IMAGES) {
          skipped++;
          continue;
        }
        added.push({ imageId: image.id, name: file.name, upload: image });
      } catch (error) {
        errors.push(
          `${file.name}：${error instanceof ApiError ? error.message : ERROR_HINTS["invalid-image"]}`,
        );
      }
    }
    if (token !== readRef.current) return;
    if (added.length) {
      setInputs((current) => [...current, ...added]);
      setDirty(true);
      if (!inputs.length)
        setForm((current) => ({ ...current, ratio: "auto", cw: "", ch: "" }));
    }
    if (skipped)
      errors.push(
        `${ERROR_HINTS["too-many-images"]}本次添加 ${added.length} 张，${skipped} 张未添加。`,
      );
    setUploadError(errors.join("\n"));
    readingRef.current = false;
    setReading(false);
  };
  const focus = () => requestAnimationFrame(() => promptRef.current?.focus());
  /** 提交前检查：提示与聚焦由调用方按 reason 处理 */
  const checkParams = () =>
    draftToParams({ form, inpaint, sizeAccepted, reading: readingRef.current });
  return {
    form,
    inputs,
    images,
    inpaint,
    inpaintInfo,
    inputFidelity,
    dirty,
    reading,
    uploadError,
    addFiles,
    removeInput,
    removeMask,
    applyInpaint,
    acceptSize: () => setSizeAccepted(true),
    appendExisting,
    applySketch,
    setInputFidelity: (value: FidelityChoice) => {
      setFidelity(value);
      setDirty(true);
    },
    initialize,
    patchForm,
    customValid,
    promptRef,
    checkParams,
    focus,
  };
}
