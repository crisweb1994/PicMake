/** 灯箱：纯展示的受控弹层 */
import { Button } from "@heroui/react";
import { X } from "lucide-react";
import type { DisplayImage } from "../../lib/view-models";

/* ── 灯箱 ── */
export function Lightbox(props: {
  img: DisplayImage | null;
  prompt: string;
  onDownload: () => void;
  onReuse?: () => void;
  onClose: () => void;
}) {
  if (!props.img) return null;
  return (
    <div
      className="pm-lb"
      role="dialog"
      aria-label="查看大图"
      onClick={(e) => e.target === e.currentTarget && props.onClose()}
    >
      <button
        type="button"
        className="pm-x-btn"
        aria-label="关闭大图"
        onClick={props.onClose}
      >
        <X size={15} />
      </button>
      <div className="pm-lb-wrap">
        <div
          className="pm-lb-im"
          style={{ backgroundImage: `url(${props.img.url})` }}
          role="img"
          aria-label={props.prompt}
          onClick={props.onClose}
        />
        <div className="pm-lb-bar">
          <p>{props.prompt}</p>
          <Button variant="secondary" onPress={props.onDownload}>
            下载
          </Button>
          {props.onReuse && (
            <Button variant="primary" onPress={props.onReuse}>
              复用参数
            </Button>
          )}
          <Button variant="secondary" onPress={props.onClose}>
            关闭
          </Button>
        </div>
      </div>
    </div>
  );
}
