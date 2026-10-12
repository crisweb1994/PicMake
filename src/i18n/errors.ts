/** 错误文案：标题、通用建议、客户端细节与服务端原文如何拼成一条提示（纯函数，t 由调用方传入） */
import type { TFunction } from "i18next";
import {
  ApiError,
  MAX_INPUT_BYTES,
  MAX_INPUT_IMAGES,
  type ApiErrorKind,
} from "../lib/types";

export const errorTitle = (kind: ApiErrorKind, t: TFunction): string =>
  t(`errors.${kind}.title`);

/** 该种类的通用建议；限制数值来自 lib 常量，文案里不写死 */
export const errorHint = (kind: ApiErrorKind, t: TFunction): string =>
  t(`errors.${kind}.hint`, {
    max: MAX_INPUT_IMAGES,
    maxMiB: MAX_INPUT_BYTES / 1024 / 1024,
  });

/** 提示正文：服务端原文（原样，不翻译）→ 客户端细节 → 该种类的通用建议 */
export function errorDetail(error: unknown, t: TFunction): string {
  if (!(error instanceof ApiError)) return errorHint("unknown", t);
  if (error.message) return error.message;
  if (error.detail) {
    // 各 code 需要的插值参数不同，联合类型下无法逐个校验；由 ApiError 的构造处保证
    const lookup = t as unknown as (key: string, options?: object) => string;
    return lookup(`errors.detail.${error.detail.code}`, error.detail.params);
  }
  return errorHint(error.kind, t);
}

/** toast 用的整条提示：标题 + 正文 */
export function errorMessage(error: unknown, t: TFunction): string {
  const kind = error instanceof ApiError ? error.kind : "unknown";
  return t("errors.toast", {
    title: errorTitle(kind, t),
    detail: errorDetail(error, t),
  });
}

/** 标题 + 该种类的通用建议（保存失败、历史读取失败等没有 ApiError 的场合） */
export const kindMessage = (kind: ApiErrorKind, t: TFunction): string =>
  t("errors.toast", { title: errorTitle(kind, t), detail: errorHint(kind, t) });
