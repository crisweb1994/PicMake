/** 结果舞台：空 / 生成中 / 单张 / 网格 四形态，纯展示 */
import { useTranslation } from "react-i18next";
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
import { fmtTime } from "../i18n/format";
import { sizeText } from "../i18n/labels";
import { MODEL_LABELS } from "../lib/params";
import type { SizeSpec } from "../lib/types";
import type { DisplayGen, DisplayImage, GenPlan } from "../lib/view-models";

export function StageEmpty(props: { onStart: () => void }) {
  const { t } = useTranslation();
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
      <h2>{t("stage.emptyTitle")}</h2>
      <p>{t("stage.emptyHint")}</p>
      <Button
        variant="outline"
        className="pm-ghost-cta"
        onPress={props.onStart}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" />
        </svg>
        {t("stage.emptyCta")}
      </Button>
    </div>
  );
}

/** 生成占位卡：点阵在卡内波动；渐进预览到达后在原位淡入，替掉该卡的点阵 */
function GenTile(props: { partialUrl: string | null }) {
  const { t } = useTranslation();
  return (
    <>
      <div
        className={"pm-dots-wave" + (props.partialUrl ? " is-hidden" : "")}
        aria-hidden="true"
      >
        <DotsWave />
      </div>
      {props.partialUrl && (
        <img
          src={props.partialUrl}
          alt={t("stage.generating")}
          className="pm-gen-img"
        />
      )}
    </>
  );
}

export function StageGenerating(props: {
  n: number;
  size: SizeSpec;
  partialUrl: string | null;
  partialIndex: number;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { n, size, partialUrl, partialIndex } = props;
  return (
    <>
      {/* 占位与成品共用同一套布局（pm-single / pm-grid4），完成时图片原位替换点阵 */}
      {n === 1 ? (
        <figure className="pm-single">
          <div
            className="pm-gen-single"
            style={
              size === "auto"
                ? undefined
                : { aspectRatio: `${size.w} / ${size.h}` }
            }
          >
            <GenTile partialUrl={partialUrl} />
          </div>
          {/* 预留说明行高度，完成切换时图片位置不动 */}
          <figcaption className="pm-single-meta pm-reserve" aria-hidden="true">
            &nbsp;
          </figcaption>
        </figure>
      ) : (
        <div className="pm-grid-wrap">
          <div className="pm-grid4" aria-hidden="true">
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className="pm-gen-tile">
                <GenTile
                  partialUrl={
                    partialUrl && partialIndex === i ? partialUrl : null
                  }
                />
              </div>
            ))}
          </div>
          {/* 预留说明栏高度，完成切换时网格位置不动 */}
          <div className="pm-grid-cap pm-reserve" aria-hidden="true">
            <span>{t("stage.total", { count: n })}</span>
            <Button variant="ghost" size="sm" isDisabled>
              {t("stage.downloadAll")}
            </Button>
            <Button variant="ghost" size="sm" isDisabled>
              {t("stage.reuseAndRegenerate")}
            </Button>
          </div>
        </div>
      )}
      <div className="pm-gen-pill" role="status">
        <span className="pm-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>{t("stage.generating")}</span>
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          aria-label={t("stage.cancel")}
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
  const { t, i18n } = useTranslation();
  const { row } = props.display;
  const p = row.params;
  return (
    <figure className="pm-single">
      <img
        src={props.img.url}
        alt={row.prompt}
        role="button"
        tabIndex={0}
        aria-label={t("stage.zoomAria")}
        onClick={() => props.onZoom(props.img.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            props.onZoom(props.img.id);
          }
        }}
      />
      <figcaption className="pm-single-meta">
        {MODEL_LABELS[p.model]} · {t(`params.qualityLevel.${p.quality}`)} ·{" "}
        {sizeText(p.size, t)} · {fmtTime(row.createdAt, i18n)}
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
  const { t } = useTranslation();
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
            aria-label={t("stage.result", { index: idx + 1 })}
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
                {t("stage.zoom")}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onDownload(idx);
                }}
              >
                {t("stage.download")}
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="pm-grid-cap">
        {t("stage.total", { count: images.length })}
        <Button variant="ghost" size="sm" onPress={props.onDownloadAll}>
          {t("stage.downloadAll")}
        </Button>
        <Button variant="ghost" size="sm" onPress={props.onReuse}>
          {t("stage.reuseAndRegenerate")}
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
  const { t } = useTranslation();
  return (
    <div className="pm-stage-toolbar">
      <button type="button" onClick={props.onZoom}>
        <Maximize2 size={13} />
        {t("stage.zoom")}
      </button>
      <button type="button" onClick={props.onDownload}>
        <Download size={13} />
        {t("stage.download")}
      </button>
      <button type="button" onClick={props.onReuse}>
        <RotateCcw size={13} />
        {t("stage.reuse")}
      </button>
      {props.onEdit && (
        <button type="button" onClick={props.onEdit}>
          <RefreshCw size={13} />
          {t("stage.edit")}
        </button>
      )}
      <button type="button" className="danger" onClick={props.onDelete}>
        <Trash2 size={13} />
        {t("stage.delete")}
      </button>
    </div>
  );
}

/** 舞台总装：按 phase / display 选择形态（多张常驻网格，点选弹轮播浮层，见 App） */
export function Stage(props: {
  phase: "idle" | "generating";
  partial: { url: string; index: number } | null;
  genPlan?: GenPlan | null;
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
  const single = done && display.images.length === 1;
  const bgUrl = isGen ? partial?.url : done ? display.images[0]?.url : null;

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
          n={props.genPlan?.n ?? 1}
          size={props.genPlan?.size ?? "auto"}
          partialUrl={partial?.url ?? null}
          partialIndex={partial?.index ?? 0}
          onCancel={props.onCancel}
        />
      )}
      {!isGen && !done && <StageEmpty onStart={props.onStart} />}
      {single && done && (
        <>
          <div key={display.row.id} className="pm-stage-swap">
            <StageSingle
              display={display}
              img={display.images[0]}
              onZoom={props.onLightbox}
            />
          </div>
          <StageToolbar
            onZoom={() => props.onLightbox(display.images[0].id)}
            onDownload={() => props.onDownload(0)}
            onReuse={props.onReuse}
            onEdit={props.onEdit}
            onDelete={props.onDelete}
          />
        </>
      )}
      {!isGen && done && !single && (
        <div key={display.row.id} className="pm-stage-swap">
          <StageGrid
            display={display}
            onZoomIn={(i) => props.onFocus(i)}
            onDownload={props.onDownload}
            onDownloadAll={props.onDownloadAll}
            onReuse={props.onReuse}
          />
        </div>
      )}
    </div>
  );
}
