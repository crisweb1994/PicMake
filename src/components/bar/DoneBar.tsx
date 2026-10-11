/** 创作条 complete 态：完成摘要与后续动作 */
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
  return (
    <div className="pm-bar-done">
      <div className="pm-bar-genrow">
        <span className="pm-bar-ok">
          <i aria-hidden />
          生成完成 · 已保存本地
        </span>
        <span className="pm-bar-dur">
          耗时 <b>{fmtDuration(props.done.row.durationMs)}</b>
        </span>
        <button
          type="button"
          className="pm-bar-dismiss"
          aria-label="收起，回到输入"
          onClick={props.onDismiss}
        >
          ✕
        </button>
      </div>
      <div className="pm-bar-donerow">
        <span className="pm-bar-donecap">接下来</span>
        <button
          type="button"
          className="pm-chip act primary"
          onClick={props.onAgain}
        >
          再来一版
        </button>
        <button type="button" className="pm-chip act" onClick={props.onTweak}>
          微调描述
        </button>
        <button
          type="button"
          className="pm-chip act"
          onClick={props.onDownloadAll}
        >
          下载全部
        </button>
        <button
          type="button"
          className="pm-chip act"
          onClick={props.onUseAsRef}
        >
          <Sparkles size={11} />
          设为参考图
        </button>
      </div>
    </div>
  );
}
