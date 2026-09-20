/** 生成表单的唯一状态：更新、历史参数回填与提交校验。 */
import { useRef, useState } from "react";
import { toast } from "@heroui/react";
import {
  customOk,
  DEFAULT_FORM,
  formToParams,
  paramsToForm,
  validateParams,
  type GenForm,
} from "../lib/params";
import type { GenParams } from "../lib/types";

export function useForm() {
  const [form, setForm] = useState<GenForm>(DEFAULT_FORM);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const customValid = customOk(form);

  const patchForm = (patch: Partial<GenForm>) =>
    setForm((current) => ({ ...current, ...patch }));

  const getParams = () => {
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
      return null;
    }
    return params;
  };

  return {
    form,
    patchForm,
    customValid,
    promptRef,
    getParams,
    fill: (params: GenParams) => setForm(paramsToForm(params)),
    focus: () => requestAnimationFrame(() => promptRef.current?.focus()),
  };
}
