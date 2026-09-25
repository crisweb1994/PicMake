/** 同一次提交的草稿：文字、参数与图片；读取离开即失效，图片 URL 交给资源 hook。
 *  局部重绘附件（TECH §3.3）由本 hook 唯一拥有：输入列表与可选 inpaint 在一次
 *  状态更新中原子落位——底图恒为 inputs[0]，移除底图同时清除选区。 */
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@heroui/react";
import {
  customOk,
  DEFAULT_FORM,
  formToParams,
  paramsToForm,
  validateParams,
  type GenForm,
} from "../lib/params";
import {
  ApiError,
  ERROR_HINTS,
  MAX_INPUT_IMAGES,
  type FidelityChoice,
  type GenParams,
  type InpaintDraft,
  type InputImage,
  type MaskImage,
} from "../lib/types";
import { inpaintTargetSize } from "../lib/inpaint";
import { readInputImage } from "../lib/input-images";
import type { ImageRow } from "../db/schema";
import { useImageAssets } from "./useImageAssets";

export function useForm() {
  const [form, setForm] = useState<GenForm>(DEFAULT_FORM);
  const [inputs, setInputs] = useState<InputImage[]>([]);
  const [inpaint, setInpaint] = useState<InpaintDraft | null>(null);
  /** 尺寸接受状态（IP-10）：页面 UI 状态，仅对当前底图与目标尺寸有效 */
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
    name: input.name ?? "已有作品",
    label: `图${index + 1} · ${input.name ?? "已有作品"}`,
    url: assets[input.imageId]?.url,
    isSketch: !!input.upload?.sketch,
    /** ✎ 入口角色（IP-08）：底图=修改选区；重绘中参考图停用；普通图可发起 */
    inpaintRole: inpaint
      ? index === 0
        ? ("mask" as const)
        : ("ref" as const)
      : ("candidate" as const),
  }));
  /** 输出目标与接受状态投影（IP-10） */
  const inpaintInfo = useMemo(() => {
    if (!inpaint) return null;
    const target = inpaintTargetSize(inpaint.mask.width, inpaint.mask.height);
    if (!target) {
      // 底图不合法：理论不可达（进入编辑器前已拦截），保守按需重新选择
      return { tw: 0, th: 0, suggested: false, accepted: false, reason: "" };
    }
    return {
      tw: target.w,
      th: target.h,
      suggested: target.suggested,
      accepted: target.suggested ? sizeAccepted : true,
      reason: target.reason,
    };
  }, [inpaint, sizeAccepted]);
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
  const removeInput = (id?: string) => {
    stopReading();
    setInputs((current) =>
      id ? current.filter((input) => input.imageId !== id) : [],
    );
    // 移除底图同时移除与它绑定的选区；不允许留下无底图的重绘状态（IP-08）
    if (id && inpaint && inputs[0]?.imageId === id) {
      setInpaint(null);
      setSizeAccepted(false);
      toast("已移除底图与选区，剩余图片重新编号，请检查描述");
    } else {
      toast("图片编号已更新，请检查描述中的图序号");
    }
    setDirty(true);
    setUploadError("");
  };
  /** 「移除选区」：保留底图、描述与参数，切换为普通图片编辑（IP-08） */
  const removeMask = () => {
    setInpaint(null);
    setSizeAccepted(false);
    setDirty(true);
    toast("已移除选区：保留底图与描述，切换为普通图片编辑");
  };
  /** 选区确认（IP-07）：一次状态更新里重排底图为图1、保留其余参考图相对顺序、
   *  设置 mask 与原文件引用；接受状态仅对未接受的新目标重置。 */
  const applyInpaint = (
    payload: {
      base: ImageRow;
      mask: MaskImage;
      original?: InpaintDraft["original"];
      entry: "result" | "draft-input" | "reedit";
      unchanged: boolean;
    },
    /** draft-input 入口被选中的原输入（重排后移除） */
    chosenInputId?: string,
  ): boolean => {
    if (inputs.length >= MAX_INPUT_IMAGES && payload.entry === "result")
      return false;
    setInputs((current) => {
      if (payload.entry === "reedit") return current; // 底图已在位
      // 排除被涂选的原输入与任何同底图旧输入（result 入口可能已由 initialize 放入）
      const rest = current.filter(
        (input) =>
          input.imageId !== chosenInputId && input.imageId !== payload.base.id,
      );
      const base: InputImage = {
        imageId: payload.base.id,
        name: "底图",
        upload: payload.base,
      };
      return [base, ...rest];
    });
    if (payload.entry !== "reedit") {
      const target = inpaintTargetSize(payload.mask.width, payload.mask.height);
      setSizeAccepted(target ? !target.suggested : false);
    }
    setInpaint((current) => {
      if (payload.entry === "reedit" && current && payload.unchanged)
        return current; // 无实质修改沿用原资源
      return { mask: payload.mask, original: payload.original };
    });
    setDirty(true);
    return true;
  };
  /** 「设为参考图」：把一条已有结果追加为输入源，不打断当前草稿（chipbar complete 态） */
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
  /** 画板确认的草图落附件（SKETCH §6.2/§8.4）：原位替换或追加；首版仅一个活动草图。
   *  最终数量与替换目标校验在此完成，失败返回 false 由画板保留。 */
  const applySketch = (image: ImageRow, replaces: string | null): boolean => {
    const target =
      replaces ?? inputs.find((input) => input.upload?.sketch)?.imageId ?? null;
    if (target) {
      const idx = inputs.findIndex((input) => input.imageId === target);
      if (idx < 0) {
        toast("原草图附件已变化，请重新确认");
        return false;
      }
      setInputs((current) =>
        current.map((input, i) =>
          i === idx
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
  const getParams = () => {
    if (readingRef.current) return null;
    if (!(inpaint && inpaintInfo) && !customValid) {
      toast(
        "自定义尺寸无效：宽高须被 16 整除，比例 1:3 ～ 3:1，不超过 3840 × 2160",
      );
      return null;
    }
    const params = formToParams(form);
    // 局部重绘：输出尺寸按 IP-10 目标（原尺寸或建议尺寸），不开放任意比例
    if (inpaint && inpaintInfo)
      params.size = { w: inpaintInfo.tw, h: inpaintInfo.th };
    const validation = validateParams(params);
    if (validation.length) {
      toast(validation[0]);
      if (!params.prompt.trim()) focus();
      return null;
    }
    if (inputs.length > MAX_INPUT_IMAGES) {
      toast(ERROR_HINTS["too-many-images"]);
      return null;
    }
    return params;
  };
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
    getParams,
    focus,
  };
}
