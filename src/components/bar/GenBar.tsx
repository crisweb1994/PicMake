/** 创作条 generating 态：状态行 + 取消 */
import { useTranslation } from "react-i18next";
import { MODEL_LABELS } from "../../lib/params";
import type { ModelId } from "../../lib/types";

export function GenBar(props: {
  model: ModelId;
  partialIndex: number;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const step = Math.min(3, props.partialIndex + 1);
  return (
    <div className="pm-bar-gen" role="status">
      <div className="pm-bar-genrow">
        <span className="pm-bar-genmodel">{MODEL_LABELS[props.model]}</span>
        <span className="pm-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="pm-bar-genst">
          {t("bar.genStatus")} <b>{step}/3</b>
        </span>
        <button
          type="button"
          className="pm-bar-cancel"
          onClick={props.onCancel}
        >
          ✕ {t("bar.genCancel")}
        </button>
      </div>
      <div className="pm-shimmer" aria-hidden />
      <p className="pm-bar-gennote">{t("bar.genNote")}</p>
    </div>
  );
}
