/** 轮播：多图点选浮层：纯展示的受控弹层 */
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { StageToolbar } from "../Stage";
import type { DisplayImage } from "../../lib/view-models";

/* ── 轮播：多图点选浮层 ── */
export function Carousel(props: {
  img: DisplayImage;
  prompt: string;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onZoom: () => void;
  onDownload: () => void;
  onReuse: () => void;
  onEdit?: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="pm-car"
      role="dialog"
      aria-label="查看图片"
      onClick={(e) => e.target === e.currentTarget && props.onClose()}
    >
      <button
        type="button"
        className="pm-x-btn"
        aria-label="关闭轮播"
        onClick={props.onClose}
      >
        <X size={15} />
      </button>
      <button
        type="button"
        className="pm-car-arrow prev"
        aria-label="上一张"
        onClick={props.onPrev}
      >
        <ChevronLeft size={19} />
      </button>
      <figure className="pm-car-fig">
        <img src={props.img.url} alt={props.prompt} />
        <figcaption>
          {props.index + 1} / {props.total}
        </figcaption>
      </figure>
      <button
        type="button"
        className="pm-car-arrow next"
        aria-label="下一张"
        onClick={props.onNext}
      >
        <ChevronRight size={19} />
      </button>
      <StageToolbar
        onZoom={props.onZoom}
        onDownload={props.onDownload}
        onReuse={props.onReuse}
        onEdit={props.onEdit}
        onDelete={props.onDelete}
      />
    </div>
  );
}
