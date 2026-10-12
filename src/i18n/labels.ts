/** 把 lib 返回的码、种类与结构化数据变成当前语言的文案（纯函数，t 由调用方传入；组件须用 useTranslation 的 t，
 *  这样切换语言会重渲染）。lib 本身不产出任何界面文字。 */
import type { TFunction } from "i18next";
import type { SizeReason } from "../lib/inpaint";
import { BASE_LABELS, isCustomActive, type GenForm } from "../lib/params";
import type { RatioId } from "../lib/params";
import { SIZE_LIMITS } from "../lib/size";
import type {
  InpaintIssue,
  MissingResource,
  SizeSpec,
  SketchOrigin,
  UploadIssue,
} from "../lib/types";
import type { InputNaming } from "../lib/view-models";
import type { DraftIssue } from "../lib/workspace-rules";
import { errorHint } from "./errors";

/** 展示用尺寸文本，如 "1536 × 1024" / "自动" */
export const sizeText = (size: SizeSpec, t: TFunction): string =>
  size === "auto" ? t("common.auto") : `${size.w} × ${size.h}`;

/** chip 上的尺寸值文本：自定义宽高 / 比例·基准 / 自动（MiniBar 与比例 chip 共用） */
export function sizeChipValue(
  f: Pick<GenForm, "ratio" | "base" | "cw" | "ch">,
  t: TFunction,
): string {
  if (isCustomActive(f)) return `${f.cw}×${f.ch}`;
  if (f.ratio === "auto") return t("common.auto");
  return `${f.ratio} · ${BASE_LABELS.find((b) => b.id === f.base)?.label}`;
}

export const ratioLabel = (id: RatioId, t: TFunction): string =>
  id === "auto" ? t("common.auto") : id;

/** 提交前校验提示（描述为空、尺寸问题等） */
export const issueText = (issue: DraftIssue, t: TFunction): string =>
  t(`issues.${issue}`, { long: SIZE_LIMITS.long, short: SIZE_LIMITS.short });

export const inpaintIssueText = (issue: InpaintIssue, t: TFunction): string =>
  t(`inpaint.issue.${issue}`);

/** 重绘输出尺寸与原图不同的原因 */
export function sizeReasonText(reason: SizeReason, t: TFunction): string {
  const parts: string[] = [];
  if (reason.floor === "w") parts.push(t("inpaint.reason.floorWidth"));
  if (reason.floor === "h") parts.push(t("inpaint.reason.floorHeight"));
  if (reason.floor === "both") parts.push(t("inpaint.reason.floorBoth"));
  if (reason.scaled) parts.push(t("inpaint.reason.scaled"));
  return parts.join(t("inpaint.reason.separator")) || t("inpaint.reason.exact");
}

/** 上传读取阶段的一条提示 */
export function uploadIssueText(issue: UploadIssue, t: TFunction): string {
  if (issue.kind === "file")
    return t("input.uploadFile", {
      file: issue.file,
      reason: errorHint(issue.error, t),
    });
  return t("input.overflow", {
    limit: errorHint("too-many-images", t),
    kept: issue.kept,
    skipped: issue.skipped,
  });
}

/** 输入来源的名字（用户文件名原样，系统来源按当前语言） */
export function inputName(naming: InputNaming, t: TFunction): string {
  switch (naming.kind) {
    case "file":
      return naming.fileName;
    case "sketch":
      return t("input.sketch");
    case "base":
      return t("input.base");
    case "work":
      return naming.workIndex
        ? t("input.workIndexed", { index: naming.workIndex })
        : t("input.work");
  }
}

/** 「图N」；index 从 0 起 */
export const inputNumber = (index: number, t: TFunction): string =>
  t("input.number", { index: index + 1 });

/** 「图N · 名字」 */
export const inputLabel = (
  naming: InputNaming,
  index: number,
  t: TFunction,
): string =>
  t("input.label", {
    number: inputNumber(index, t),
    name: inputName(naming, t),
  });

/** 草图弹层角落的说明：尺寸 + 来源 */
export function sketchMeta(
  size: { width: number; height: number },
  origin: SketchOrigin,
  t: TFunction,
): string {
  const params = { w: size.width, h: size.height };
  if (origin.kind === "attachment")
    return t("sketch.metaAttachment", { ...params, index: origin.index });
  if (origin.kind === "history") return t("sketch.metaHistory", params);
  return t("sketch.meta", params);
}

/** 读取记录时缺失的资源名，嵌入「不可用」类提示 */
export function missingText(missing: MissingResource, t: TFunction): string {
  if (missing.kind === "reference")
    return missing.name
      ? t("missing.referenceNamed", { name: missing.name })
      : t("missing.reference");
  return missing.kind === "mask" ? t("missing.mask") : t("missing.base");
}
