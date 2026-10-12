/** 只读选区查看：底图 + 已保存选区叠加。受控展示组件 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { overlayFill, paintOverlayLayer } from "../lib/inpaint-canvas";
import type { MaskCommand } from "../lib/types";

export function MaskViewModal(props: {
  baseUrl: string;
  baseW: number;
  baseH: number;
  commands: MaskCommand[];
  onAdjust?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // 重绘记录的 inputSources[0] 恒为底图
  const name = t("input.base");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);
  const [width, setWidth] = useState(720);

  useLayoutEffect(() => {
    setWidth(
      Math.max(240, Math.min(920, (wrapRef.current?.clientWidth ?? 720) - 8)),
    );
  }, []);

  const height = Math.round((width * props.baseH) / props.baseW);

  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const doc = {
      version: 1 as const,
      baseImageId: "view",
      width: props.baseW,
      height: props.baseH,
      commands: props.commands,
    };
    paintOverlayLayer(
      ctx,
      doc,
      doc.commands.length,
      null,
      cv.width / props.baseW,
      overlayFill(),
    );
  }, [props.commands, props.baseW, props.baseH, width]);

  return (
    <div className="pm-vm-backdrop">
      <div
        className="pm-vm-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t("mask.label")}
      >
        <header>
          <b>{t("mask.title")}</b>
          <span>
            {t("mask.header", { name, w: props.baseW, h: props.baseH })}
          </span>
        </header>
        <div className="pm-vm-wrap" ref={wrapRef}>
          <div className={"pm-vm-img" + (hidden ? " nomask" : "")}>
            <img src={props.baseUrl} alt={name} />
            <canvas ref={canvasRef} width={width} height={height} aria-hidden />
          </div>
        </div>
        <footer>
          <button type="button" onClick={() => setHidden((v) => !v)}>
            {hidden ? t("mask.show") : t("mask.hide")}
          </button>
          <span className="note">{t("mask.readonly")}</span>
          {props.onAdjust && (
            <button type="button" className="primary" onClick={props.onAdjust}>
              {t("mask.adjust")}
            </button>
          )}
          <button type="button" onClick={props.onClose}>
            {t("mask.close")}
          </button>
        </footer>
      </div>
    </div>
  );
}
