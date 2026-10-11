/** 只读选区查看：底图 + 已保存选区叠加。受控展示组件 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { overlayFill, paintOverlayLayer } from "../lib/inpaint-canvas";
import type { MaskCommand } from "../lib/types";

export function MaskViewModal(props: {
  baseUrl: string;
  name: string;
  baseW: number;
  baseH: number;
  commands: MaskCommand[];
  onAdjust?: () => void;
  onClose: () => void;
}) {
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
        aria-label="查看选区"
      >
        <header>
          <b>本次提交的选区</b>
          <span>
            {props.name} · {props.baseW} × {props.baseH}
          </span>
        </header>
        <div className="pm-vm-wrap" ref={wrapRef}>
          <div className={"pm-vm-img" + (hidden ? " nomask" : "")}>
            <img src={props.baseUrl} alt={props.name} />
            <canvas ref={canvasRef} width={width} height={height} aria-hidden />
          </div>
        </div>
        <footer>
          <button type="button" onClick={() => setHidden((v) => !v)}>
            {hidden ? "显示选区" : "隐藏选区"}
          </button>
          <span className="note">只读查看，不改变历史或草稿</span>
          {props.onAdjust && (
            <button type="button" className="primary" onClick={props.onAdjust}>
              调整上次重绘
            </button>
          )}
          <button type="button" onClick={props.onClose}>
            关闭
          </button>
        </footer>
      </div>
    </div>
  );
}
