/** 创作条 mini 态：迷你条 + 配置摘要 */
import { ArrowUp } from "lucide-react";
import {
  MODEL_LABELS,
  QUALITY_LABELS,
  sizeChipValue,
  type GenForm,
} from "../../lib/params";

export function MiniBar(props: {
  form: GenForm;
  disabled: boolean;
  onExpand: () => void;
}) {
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
          描述你想要的画面…
          <i>点此展开参数</i>
        </button>
        <button
          type="button"
          className="pm-bar-go"
          aria-label="展开并生成"
          onClick={props.onExpand}
          disabled={props.disabled}
        >
          <ArrowUp size={15} strokeWidth={2.4} />
        </button>
      </div>
      <p className="pm-bar-mini-meta">
        当前 {MODEL_LABELS[f.model]} · {sizeChipValue(f)} ·{" "}
        {QUALITY_LABELS[f.quality]} · ×{f.n} · {f.fmt.toUpperCase()} ·{" "}
        {f.bg === "auto"
          ? "自动背景"
          : f.bg === "transparent"
            ? "透明背景"
            : "纯色背景"}
      </p>
    </div>
  );
}
