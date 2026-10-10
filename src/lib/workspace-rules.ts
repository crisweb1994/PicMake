/** 工作区判定规则：纯函数，入参是最小快照，不依赖 store 或 hooks 的结构 */
import { inpaintTargetSize } from "./inpaint";
import { customOk, formToParams, validateParams, type GenForm } from "./params";
import type { GenParams, InpaintDraft } from "./types";
import type { InpaintBarInfo } from "./view-models";

/** liveQuery 回推后的选中项：首次加载选最近一条；只有原选中项确实从列表中删除时才回退 */
export function nextSelection(
  prev: readonly { id: string }[] | undefined,
  next: readonly { id: string }[],
  selectedId: string | null,
): string | null {
  if (!prev) return next[0]?.id ?? null;
  // 写入完成可早于 liveQuery 回推：选中项不在旧列表里时保持不动
  if (
    selectedId &&
    prev.some((row) => row.id === selectedId) &&
    !next.some((row) => row.id === selectedId)
  )
    return next[0]?.id ?? null;
  return selectedId;
}

/** 局部重绘的输出目标与接受状态 */
export function inpaintBarInfo(
  inpaint: InpaintDraft | null,
  sizeAccepted: boolean,
): InpaintBarInfo | null {
  if (!inpaint) return null;
  const target = inpaintTargetSize(inpaint.mask.width, inpaint.mask.height);
  // 底图不合法：理论不可达（进入编辑器前已拦截），保守按需重新选择
  if (!target)
    return { tw: 0, th: 0, suggested: false, accepted: false, reason: "" };
  return {
    tw: target.w,
    th: target.h,
    suggested: target.suggested,
    accepted: target.suggested ? sizeAccepted : true,
    reason: target.reason,
  };
}

export type DraftParamsResult =
  | { ok: true; params: GenParams }
  | {
      ok: false;
      reason: "size-not-accepted" | "reading" | "custom-size" | "invalid";
      message?: string;
      /** 描述为空：调用方聚焦描述框 */
      focusPrompt?: boolean;
    };

/** 草稿 → 请求参数；检查顺序：重绘尺寸已接受 → 不在读取 → 自定义尺寸合法 → 参数校验 */
export function draftToParams(d: {
  form: GenForm;
  inpaint: InpaintDraft | null;
  sizeAccepted: boolean;
  reading: boolean;
}): DraftParamsResult {
  const info = inpaintBarInfo(d.inpaint, d.sizeAccepted);
  if (info?.suggested && !info.accepted)
    return {
      ok: false,
      reason: "size-not-accepted",
      message: "输出尺寸与原图不同，请先接受建议尺寸",
    };
  if (d.reading) return { ok: false, reason: "reading" };
  if (!info && !customOk(d.form))
    return {
      ok: false,
      reason: "custom-size",
      message:
        "自定义尺寸无效：宽高须被 16 整除，比例 1:3 ～ 3:1，不超过 3840 × 2160",
    };
  const params = formToParams(d.form);
  // 局部重绘：输出尺寸按目标尺寸，不开放任意比例
  if (info) params.size = { w: info.tw, h: info.th };
  const errors = validateParams(params);
  if (errors.length)
    return {
      ok: false,
      reason: "invalid",
      message: errors[0],
      focusPrompt: !params.prompt.trim(),
    };
  return { ok: true, params };
}
