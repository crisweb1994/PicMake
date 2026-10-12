/** 创作条 complete 态：完成摘要与后续动作 */
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { fmtDuration } from "../../lib/format";
import type { DisplayGen } from "../../lib/view-models";

export function DoneBar(props: {
  done: DisplayGen;
  onAgain: () => void;
  onTweak: () => void;
  onDownloadAll: () => void;
  onUseAsRef: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="pm-bar-done">
      <div className="pm-bar-genrow">
        <span className="pm-bar-ok">
          <i aria-hidden />
          {t("bar.done")}
        </span>
        <span className="pm-bar-dur">
          {t("bar.duration")} <b>{fmtDuration(props.done.row.durationMs)}</b>
        </span>
        <button
          type="button"
          className="pm-bar-dismiss"
          aria-label={t("bar.dismiss")}
          onClick={props.onDismiss}
        >
          ✕
        </button>
      </div>
      <div className="pm-bar-donerow">
        <span className="pm-bar-donecap">{t("bar.next")}</span>
        <button
          type="button"
          className="pm-chip act primary"
          onClick={props.onAgain}
        >
          {t("bar.again")}
        </button>
        <button type="button" className="pm-chip act" onClick={props.onTweak}>
          {t("bar.tweak")}
        </button>
        <button
          type="button"
          className="pm-chip act"
          onClick={props.onDownloadAll}
        >
          {t("common.downloadAll")}
        </button>
        <button
          type="button"
          className="pm-chip act"
          onClick={props.onUseAsRef}
        >
          <Sparkles size={11} />
          {t("bar.useAsRef")}
        </button>
      </div>
    </div>
  );
}
