/** 创作条 generating 态：状态行 + 取消 */
import { MODEL_LABELS } from "../../lib/params";
import type { ModelId } from "../../lib/types";

export function GenBar(props: {
  model: ModelId;
  partialIndex: number;
  onCancel: () => void;
}) {
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
          正在生成 · 渐进预览 <b>{step}/3</b>
        </span>
        <button
          type="button"
          className="pm-bar-cancel"
          onClick={props.onCancel}
        >
          ✕ 取消
        </button>
      </div>
      <div className="pm-shimmer" aria-hidden />
      <p className="pm-bar-gennote">
        单次流式请求 · partial_images 3 · 完成后自动保存到本地
      </p>
    </div>
  );
}
