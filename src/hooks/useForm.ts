/** 同一次提交的草稿：文字、参数与图片；读取离开即失效，图片 URL 交给资源 hook。 */
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
  type GenParams,
  type InputImage,
  type InputFidelity,
} from "../lib/types";
import { readInputImage } from "../lib/input-images";
import { useImageAssets } from "./useImageAssets";

export function useForm() {
  const [form, setForm] = useState<GenForm>(DEFAULT_FORM);
  const [inputs, setInputs] = useState<InputImage[]>([]);
  const [inputFidelity, setFidelity] = useState<InputFidelity>("high");
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
  }));
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
    setFidelity("high");
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
    setDirty(true);
    setUploadError("");
    toast("图片编号已更新，请检查描述中的图序号");
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
    if (!customValid) {
      toast(
        "自定义尺寸无效：宽高须被 16 整除，比例 1:3 ～ 3:1，不超过 3840 × 2160",
      );
      return null;
    }
    const params = formToParams(form);
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
    inputFidelity,
    dirty,
    reading,
    uploadError,
    addFiles,
    removeInput,
    appendExisting,
    setInputFidelity: (value: InputFidelity) => {
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
