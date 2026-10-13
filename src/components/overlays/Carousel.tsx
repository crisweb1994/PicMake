/** 轮播：多图点选浮层：纯展示的受控弹层 */
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { StageToolbar } from "../Stage";
import type { DisplayImage } from "../../lib/view-models";

/* ── 轮播：多图点选浮层 ── */
export function Carousel(props: {
  img: DisplayImage;
  prompt: string;
  index: number;
  total: number;
  /** 当前图的尺寸标注：多尺寸记录里各图尺寸不同才传 */
  meta?: string;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onZoom: () => void;
  onDownload: () => void;
  onReuse: () => void;
  onEdit?: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="pm-car"
      role="dialog"
      aria-label={t("carousel.label")}
      onClick={(e) => e.target === e.currentTarget && props.onClose()}
    >
      <button
        type="button"
        className="pm-x-btn"
        aria-label={t("carousel.close")}
        onClick={props.onClose}
      >
        <X size={15} />
      </button>
      <button
        type="button"
        className="pm-car-arrow prev"
        aria-label={t("carousel.prev")}
        onClick={props.onPrev}
      >
        <ChevronLeft size={19} />
      </button>
      <figure className="pm-car-fig">
        <img src={props.img.url} alt={props.prompt} />
        <figcaption>
          {props.index + 1} / {props.total}
          {props.meta && <span className="pm-car-meta"> · {props.meta}</span>}
        </figcaption>
      </figure>
      <button
        type="button"
        className="pm-car-arrow next"
        aria-label={t("carousel.next")}
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
