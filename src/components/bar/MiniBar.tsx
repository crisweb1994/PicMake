/** 创作条 mini 态：迷你条 + 配置摘要 */
import { useTranslation } from "react-i18next";
import { ArrowUp } from "lucide-react";
import { sizeSummary } from "../../i18n/labels";
import { MODEL_LABELS, isMultiSize, type GenForm } from "../../lib/params";

export function MiniBar(props: {
  form: GenForm;
  disabled: boolean;
  onExpand: () => void;
}) {
  const { t } = useTranslation();
  const f = props.form;
  return (
    <div className="pm-bar-mini">
      <div className="pm-bar-mini-row">
        <button
          type="button"
          className="pm-bar-mini-in"
          onClick={props.onExpand}
          disabled={props.disabled}
        >
          {t("bar.miniPlaceholder")}
          <i>{t("bar.miniExpandHint")}</i>
        </button>
        <button
          type="button"
          className="pm-bar-go"
          aria-label={t("bar.miniExpandAria")}
          onClick={props.onExpand}
          disabled={props.disabled}
        >
          <ArrowUp size={15} strokeWidth={2.4} />
        </button>
      </div>
      <p className="pm-bar-mini-meta">
        {isMultiSize(f)
          ? // 多比例：比例位置列出全部比例，总张数就是比例数，不显示张数
            t("bar.miniMetaMulti", {
              model: MODEL_LABELS[f.model],
              size: sizeSummary(f, t),
              quality: t(`params.qualityLevel.${f.quality}`),
              format: f.fmt.toUpperCase(),
              background: t(`params.backgroundLong.${f.bg}`),
            })
          : t("bar.miniMeta", {
              model: MODEL_LABELS[f.model],
              size: sizeSummary(f, t),
              quality: t(`params.qualityLevel.${f.quality}`),
              n: f.n,
              format: f.fmt.toUpperCase(),
              background: t(`params.backgroundLong.${f.bg}`),
            })}
      </p>
    </div>
  );
}
