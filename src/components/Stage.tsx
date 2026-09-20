/** 结果舞台（PRD FR-5）：空 / 生成中 / 单张 / 多张网格 四形态，纯展示 */
import type { ReactNode } from "react";
import { Button } from "@heroui/react";
import {
  Download,
  Maximize2,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { DotsWave } from "./DotsWave";
import { fmtTime } from "../lib/format";
import { MODEL_LABELS, QUALITY_LABELS, sizeText } from "../lib/params";
import type { DisplayGen, DisplayImage } from "../lib/view-models";

export function StageEmpty(props: { onStart: () => void }) {
  return (
    <div className="pm-empty">
      <div className="pm-empty-glow" aria-hidden="true" />
      <div className="pm-stack" aria-hidden="true">
        <i />
        <i />
        <i />
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" />
        </svg>
      </div>
      <h2>从一句描述开始</h2>
      <p>写下你想要的画面，几秒后它会出现在这里</p>
      <Button
        variant="outline"
        className="pm-ghost-cta"
        onPress={props.onStart}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" />
        </svg>
        写下第一句
      </Button>
    </div>
  );
}

export function StageGenerating(props: {
  partialUrl: string | null;
  partialIndex: number;
  onCancel: () => void;
}) {
  return (
    <>
      <div
        className={"pm-dots-wave" + (props.partialUrl ? " is-hidden" : "")}
        aria-hidden="true"
      >
        <DotsWave />
      </div>
      {props.partialUrl && (
        <img src={props.partialUrl} alt="正在生成" className="pm-gen-img" />
      )}
      <div className="pm-gen-pill">
        <span className="pm-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>正在生成</span>
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          aria-label="取消生成"
          onPress={props.onCancel}
        >
          <X size={13} />
        </Button>
      </div>
    </>
  );
}

export function StageSingle(props: {
  display: DisplayGen;
  img: DisplayImage;
  onZoom: (id: string) => void;
}) {
  const { row } = props.display;
  const p = row.params;
  return (
    <figure className="pm-single">
      <img
        src={props.img.url}
        alt={row.prompt}
        onClick={() => props.onZoom(props.img.id)}
      />
      <figcaption className="pm-single-meta">
        {MODEL_LABELS[p.model]} · {QUALITY_LABELS[p.quality]} ·{" "}
        {sizeText(p.size)} · {fmtTime(row.createdAt)}
      </figcaption>
    </figure>
  );
}

export function StageGrid(props: {
  display: DisplayGen;
  onZoomIn: (idx: number) => void;
  onDownload: (idx: number) => void;
  onDownloadAll: () => void;
  onReuse: () => void;
}) {
  const { row, images } = props.display;
  return (
    <div className="pm-grid-wrap">
      <div className="pm-grid4">
        {images.map((im, idx) => (
          <div
            key={im.id}
            className="pm-gtile"
            role="button"
            tabIndex={0}
            aria-label={`结果 ${idx + 1}`}
            onClick={() => props.onZoomIn(idx)}
            onKeyDown={(e) => {
              if (
                e.target === e.currentTarget &&
                (e.key === "Enter" || e.key === " ")
              ) {
                e.preventDefault();
                props.onZoomIn(idx);
              }
            }}
          >
            <img src={im.url} alt={`${row.prompt} ${idx + 1}`} />
            <div className="pm-gtile-acts">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onZoomIn(idx);
                }}
              >
                放大
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onDownload(idx);
                }}
              >
                下载
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="pm-grid-cap">
        共 {images.length} 张
        <Button variant="ghost" size="sm" onPress={props.onDownloadAll}>
          下载全部
        </Button>
        <Button variant="ghost" size="sm" onPress={props.onReuse}>
          复用参数再生成
        </Button>
      </div>
    </div>
  );
}

export function StageToolbar(props: {
  onZoom: () => void;
  onDownload: () => void;
  onReuse: () => void;
  onEdit?: () => void;
  onDelete: () => void;
}) {
  const btns: Array<{
    label: string;
    icon: ReactNode;
    fn: () => void;
    danger?: boolean;
  }> = [
    { label: "放大", icon: <Maximize2 size={13} />, fn: props.onZoom },
    { label: "下载", icon: <Download size={13} />, fn: props.onDownload },
    { label: "复用参数", icon: <RotateCcw size={13} />, fn: props.onReuse },
    ...(props.onEdit
      ? [{ label: "编辑此图", icon: <RefreshCw size={13} />, fn: props.onEdit }]
      : []),
    {
      label: "删除",
      icon: <Trash2 size={13} />,
      fn: props.onDelete,
      danger: true,
    },
  ];
  return (
    <div className="pm-stage-toolbar">
      {btns.map((b) => (
        <button
          key={b.label}
          type="button"
          className={b.danger ? "danger" : ""}
          onClick={b.fn}
        >
          {b.icon}
          {b.label}
        </button>
      ))}
    </div>
  );
}

/** 舞台总装：按 phase / display 选择形态（多张常驻网格，点选弹轮播浮层，见 App） */
export function Stage(props: {
  contextImage: DisplayImage | null;
  phase: "idle" | "generating";
  partial: { url: string; index: number } | null;
  display: DisplayGen | null;
  onFocus: (idx: number | null) => void;
  onLightbox: (id: string) => void;
  onDownload: (idx: number) => void;
  onDownloadAll: () => void;
  onReuse: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onStart: () => void;
}) {
  const { display, phase, partial } = props;
  const isGen = phase === "generating";
  const done = !isGen && display;
  const single = done && (props.contextImage || display.images.length === 1);
  const bgUrl = isGen
    ? (partial?.url ?? props.contextImage?.url)
    : done
      ? (props.contextImage?.url ?? display.images[0]?.url)
      : null;

  return (
    <div
      className="pm-stage"
      data-mode={isGen ? "gen" : done ? (single ? "single" : "grid") : "empty"}
    >
      <div
        className="pm-stage-bg"
        style={bgUrl ? { backgroundImage: `url(${bgUrl})` } : undefined}
        aria-hidden="true"
      />
      {isGen && (
        <StageGenerating
          partialUrl={partial?.url ?? props.contextImage?.url ?? null}
          partialIndex={partial?.index ?? 0}
          onCancel={props.onCancel}
        />
      )}
      {!isGen && !done && <StageEmpty onStart={props.onStart} />}
      {single && done && (
        <>
          <StageSingle
            display={display}
            img={props.contextImage ?? display.images[0]}
            onZoom={props.onLightbox}
          />
          {!props.contextImage && (
            <StageToolbar
              onZoom={() => props.onLightbox(display.images[0].id)}
              onDownload={() => props.onDownload(0)}
              onReuse={props.onReuse}
              onEdit={props.onEdit}
              onDelete={props.onDelete}
            />
          )}
        </>
      )}
      {!isGen && done && !single && (
        <StageGrid
          display={display}
          onZoomIn={(i) => props.onFocus(i)}
          onDownload={props.onDownload}
          onDownloadAll={props.onDownloadAll}
          onReuse={props.onReuse}
        />
      )}
    </div>
  );
}
