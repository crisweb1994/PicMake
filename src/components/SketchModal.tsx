/** 草图画板弹层（SKETCH_RESEARCH_AND_SPEC §6/§7/§9，交互对照 docs/demos/sketch-demo.html）：
 *  ChatGPT Sketch 式白色全幅编辑器，控件浮在纸面上——左上关闭 / 顶中工具胶囊 /
 *  右上撤销重做清空 / 左侧大小滑杆 / 底部色板 / 右下「使用草图」。
 *  受控展示组件：文档、撤销游标与确认态由 useSketch 持有；工具、色板、滑杆、
 *  指针绘制为组件内部交互状态；toast 经 onLimit 上报接线层。
 *  背景点击与 Esc 不关闭（FR-9 无应用快捷键）；焦点圈闭并在关闭后还原。
 *
 *  副作用清单：ResizeObserver(zone)、焦点圈闭 keydown、指针捕获（paper/slider），
 *  均随卸载清理；临时笔迹只画进 Canvas，松手才提交一个完整命令。 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Check,
  Eraser,
  Loader2,
  Pencil,
  Redo2,
  Shapes,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import type {
  SketchCommand,
  SketchDocument,
  SketchPoint,
  SketchStroke,
} from "../lib/types";
import {
  SKETCH_MAX_COMMANDS,
  SKETCH_MAX_POINTS,
  SKETCH_PALETTE,
  eraserWidth,
  makeStroke,
  penWidth,
  toLogicalPoint,
  totalPoints,
} from "../lib/sketch";
import {
  drawSketchCommand,
  replaySketch,
  sketchHasInk,
} from "../lib/sketch-canvas";

interface PaperBox {
  left: number;
  top: number;
  width: number;
  height: number;
  dpr: number;
}

const SLIDER_TRACK = 168; // 滑杆可拖长度 = 184 - 上下 8px

export function SketchModal(props: {
  doc: SketchDocument;
  cursor: number;
  meta: string;
  confirming: boolean;
  onStroke: (command: SketchCommand) => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onConfirm: () => void;
  /** 关闭请求（是否有未确认修改由接线层判断并拦截） */
  onRequestClose: () => void;
  onLimit: (kind: "commands" | "points") => void;
}) {
  const { doc, cursor } = props;
  const boardRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const penBtnRef = useRef<HTMLButtonElement>(null);
  const customColorRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef<{
    pid: number;
    last: SketchPoint;
    cmd: SketchStroke;
  } | null>(null);
  const ptsWarnedRef = useRef(false);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [colorIdx, setColorIdx] = useState(0);
  const [colorHex, setColorHex] = useState(SKETCH_PALETTE[0].hex);
  const [sizeT, setSizeT] = useState(0.35);
  const [box, setBox] = useState<PaperBox | null>(null);
  const [hasInk, setHasInk] = useState(false);

  /* ── 画布适配：contain 完整容纳，避开四周浮动控件，不裁切不拉伸 ── */
  useLayoutEffect(() => {
    const zone = zoneRef.current;
    if (!zone) return;
    const fit = () => {
      const zw = zone.clientWidth;
      const zh = zone.clientHeight;
      const narrow = zw < 720;
      const pl = narrow ? 56 : 88;
      const pr = narrow ? 36 : 64;
      const pt = 76;
      const pb = narrow ? 96 : 108;
      const aw = Math.max(60, zw - pl - pr);
      const ah = Math.max(60, zh - pt - pb);
      const r = doc.width / doc.height;
      let w = aw;
      let h = w / r;
      if (h > ah) {
        h = ah;
        w = h * r;
      }
      setBox({
        left: pl + (aw - w) / 2,
        top: pt + (ah - h) / 2,
        width: w,
        height: h,
        dpr: Math.min(window.devicePixelRatio || 1, 3),
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(zone);
    return () => ro.disconnect();
  }, [doc.width, doc.height]);

  const replayToCanvas = useCallback(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    replaySketch(ctx, doc, cursor, cv.width / doc.width);
  }, [doc, cursor]);

  useEffect(() => {
    replayToCanvas();
    // 画布与笔迹层是外部系统；hasInk 由栅格结果派生，仅在重放后同步（§6.5 alpha 判空）
    setHasInk(sketchHasInk(doc, cursor));
  }, [doc, cursor, box, replayToCanvas]);

  /* ── 焦点圈闭：Tab 循环、进入时聚焦画笔、卸载还原打开者 ── */
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const opener = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => penBtnRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusables = Array.from(
        board.querySelectorAll<HTMLElement>(
          "button:not(:disabled),[href],input,select,textarea,[tabindex]:not([tabindex='-1'])",
        ),
      ).filter((el) => el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    board.addEventListener("keydown", onKey);
    return () => {
      board.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, []);

  /* ── 临时笔迹：只画进 Canvas，松手提交完整命令；预览与导出共用绘制规则 ── */
  const liveSeg = useCallback(
    (from: SketchPoint, to: SketchPoint | null, cmd: SketchStroke) => {
      const cv = canvasRef.current;
      const ctx = cv?.getContext("2d");
      if (!cv || !ctx) return;
      const scale = cv.width / doc.width;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawSketchCommand(ctx, { ...cmd, points: to ? [from, to] : [from] }, doc);
    },
    [doc],
  );

  const hideGhost = useCallback(() => {
    if (ghostRef.current) ghostRef.current.style.display = "none";
  }, []);

  const moveGhost = useCallback(
    (clientX: number, clientY: number) => {
      const ghost = ghostRef.current;
      const paper = paperRef.current;
      if (!ghost || !paper || tool !== "eraser" || props.confirming) {
        hideGhost();
        return;
      }
      const r = paper.getBoundingClientRect();
      if (
        clientX < r.left ||
        clientX > r.right ||
        clientY < r.top ||
        clientY > r.bottom
      ) {
        hideGhost();
        return;
      }
      const d = eraserWidth(sizeT, doc) * 2 * (r.width / doc.width);
      ghost.style.display = "block";
      ghost.style.width = `${d}px`;
      ghost.style.height = `${d}px`;
      ghost.style.left = `${clientX - r.left - d / 2}px`;
      ghost.style.top = `${clientY - r.top - d / 2}px`;
    },
    [tool, sizeT, doc, props.confirming, hideGhost],
  );

  useEffect(() => {
    if (tool !== "eraser") hideGhost();
  }, [tool, hideGhost]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (props.confirming || drawingRef.current) return;
    if (doc.commands.length >= SKETCH_MAX_COMMANDS) {
      props.onLimit("commands");
      return;
    }
    e.preventDefault();
    const rect = paperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cmd = makeStroke(
      tool,
      tool === "pen" ? colorHex : undefined,
      tool === "eraser" ? eraserWidth(sizeT, doc) : penWidth(sizeT, doc),
    );
    const pt = toLogicalPoint(e.clientX, e.clientY, rect, doc);
    cmd.points.push(pt);
    drawingRef.current = { pid: e.pointerId, last: pt, cmd };
    try {
      paperRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* 无活动指针时降级为普通跟踪 */
    }
    liveSeg(pt, null, cmd);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    moveGhost(e.clientX, e.clientY);
    const d = drawingRef.current;
    if (!d || e.pointerId !== d.pid) return;
    const rect = paperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pt = toLogicalPoint(e.clientX, e.clientY, rect, doc);
    if (Math.hypot(pt.x - d.last.x, pt.y - d.last.y) < 0.8) return;
    if (totalPoints(doc, cursor) + d.cmd.points.length >= SKETCH_MAX_POINTS) {
      if (!ptsWarnedRef.current) {
        ptsWarnedRef.current = true;
        props.onLimit("points");
      }
      return;
    }
    liveSeg(d.last, pt, d.cmd);
    d.cmd.points.push(pt);
    d.last = pt;
  };

  const endDraw = (e: React.PointerEvent, discard: boolean) => {
    const d = drawingRef.current;
    if (!d || e.pointerId !== d.pid) return;
    drawingRef.current = null;
    hideGhost();
    if (discard) {
      replayToCanvas(); // 丢弃未完成的一笔，去掉残迹
      return;
    }
    props.onStroke(d.cmd);
  };

  /* ── 大小滑杆：上大下小，原生 slider 键盘语义（非应用快捷键） ── */
  const sliderRef = useRef<HTMLDivElement>(null);
  const sliderDragRef = useRef(false);
  const clampT = (t: number) => Math.min(1, Math.max(0, t));
  const sliderFromEvent = (e: React.PointerEvent) => {
    const r = sliderRef.current?.getBoundingClientRect();
    if (!r) return;
    setSizeT(clampT(1 - (e.clientY - r.top - 8) / SLIDER_TRACK));
  };
  const knobY = 8 + (1 - sizeT) * SLIDER_TRACK;
  const curWidth =
    tool === "eraser" ? eraserWidth(sizeT, doc) : penWidth(sizeT, doc);
  const dotD = box
    ? Math.min(46, Math.max(4, (curWidth * box.width) / doc.width))
    : 8;

  const canUndo = cursor > 0;
  const canRedo = cursor < doc.commands.length;
  const busy = props.confirming;

  return (
    <div className="pm-sk-overlay">
      <div
        className="pm-sk-board"
        role="dialog"
        aria-modal="true"
        aria-label="草图画板"
        ref={boardRef}
      >
        <div className="pm-sk-zone" ref={zoneRef}>
          {box && (
            <div
              className={`pm-sk-paper ${tool}`}
              ref={paperRef}
              style={{
                left: box.left,
                top: box.top,
                width: box.width,
                height: box.height,
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => endDraw(e, false)}
              onPointerCancel={(e) => endDraw(e, true)}
              onLostPointerCapture={(e) => endDraw(e, true)}
              onPointerLeave={hideGhost}
            >
              <canvas
                ref={canvasRef}
                width={Math.round(box.width * box.dpr)}
                height={Math.round(box.height * box.dpr)}
                style={{ width: box.width, height: box.height }}
              />
              <p
                className="pm-sk-hint"
                style={{ opacity: hasInk ? 0 : 1 }}
                aria-hidden={hasInk}
              >
                在纸上画下构图：位置、轮廓、色块
              </p>
              <div
                className="pm-sk-ghost"
                ref={ghostRef}
                style={{ display: "none" }}
              />
            </div>
          )}
        </div>

        <button
          type="button"
          className="pm-sk-close"
          aria-label="关闭画板"
          disabled={busy}
          onClick={props.onRequestClose}
        >
          <X size={20} />
        </button>

        <div className="pm-sk-pill" role="toolbar" aria-label="绘画工具">
          <button
            type="button"
            ref={penBtnRef}
            className={"pm-sk-tool pen" + (tool === "pen" ? " on" : "")}
            aria-label="画笔"
            aria-pressed={tool === "pen"}
            onClick={() => setTool("pen")}
          >
            <Pencil size={19} />
          </button>
          <button
            type="button"
            className="pm-sk-tool"
            aria-label="文字（首版未提供）"
            title="文字 · 首版未提供"
            disabled
          >
            <Type size={19} />
          </button>
          <button
            type="button"
            className="pm-sk-tool"
            aria-label="形状（首版未提供）"
            title="形状 · 首版未提供"
            disabled
          >
            <Shapes size={19} />
          </button>
          <button
            type="button"
            className={"pm-sk-tool" + (tool === "eraser" ? " on" : "")}
            aria-label="橡皮"
            aria-pressed={tool === "eraser"}
            onClick={() => setTool("eraser")}
          >
            <Eraser size={19} />
          </button>
        </div>

        <div className="pm-sk-hist" role="group" aria-label="撤销重做与清空">
          <button
            type="button"
            aria-label="撤销"
            disabled={!canUndo || busy}
            onClick={props.onUndo}
          >
            <Undo2 size={19} />
          </button>
          <button
            type="button"
            aria-label="重做"
            disabled={!canRedo || busy}
            onClick={props.onRedo}
          >
            <Redo2 size={19} />
          </button>
          <button
            type="button"
            aria-label="清空"
            disabled={!hasInk || busy}
            onClick={props.onClear}
          >
            <Trash2 size={19} />
          </button>
        </div>

        <div className="pm-sk-sizer-wrap">
          <div
            className="pm-sk-sizer"
            ref={sliderRef}
            role="slider"
            aria-label="工具大小"
            aria-valuemin={1}
            aria-valuemax={10}
            aria-valuenow={Math.round(1 + sizeT * 9)}
            tabIndex={0}
            onPointerDown={(e) => {
              e.preventDefault();
              sliderDragRef.current = true;
              try {
                sliderRef.current?.setPointerCapture(e.pointerId);
              } catch {
                /* 无活动指针时降级为普通跟踪 */
              }
              sliderFromEvent(e);
            }}
            onPointerMove={(e) => {
              if (sliderDragRef.current) sliderFromEvent(e);
            }}
            onPointerUp={() => {
              sliderDragRef.current = false;
            }}
            onPointerCancel={() => {
              sliderDragRef.current = false;
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp" || e.key === "ArrowRight") {
                e.preventDefault();
                setSizeT((t) => clampT(t + 0.08));
              } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
                e.preventDefault();
                setSizeT((t) => clampT(t - 0.08));
              } else if (e.key === "Home") {
                e.preventDefault();
                setSizeT(0);
              } else if (e.key === "End") {
                e.preventDefault();
                setSizeT(1);
              }
            }}
          >
            <i className="pm-sk-sizer-track" />
            <i
              className="pm-sk-sizer-fill"
              style={{ top: knobY, height: SLIDER_TRACK + 8 - knobY }}
            />
            <i className="pm-sk-sizer-knob" style={{ top: knobY }} />
          </div>
          <i
            className="pm-sk-size-dot"
            style={{ width: dotD, height: dotD, top: knobY }}
            aria-hidden
          />
        </div>

        <div className="pm-sk-colors" role="group" aria-label="画笔颜色">
          {/* 原生取色输入：保留 1px 布局盒锚在彩虹圈旁，取色窗就近弹出
              （display:none 会让弹窗回退到视口左上角）；不参与 Tab 与可访问树 */}
          <input
            ref={customColorRef}
            type="color"
            className="pm-sk-custom-input"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              setColorIdx(-1);
              setColorHex(e.target.value);
            }}
          />
          <button
            type="button"
            className="pm-sk-sw rainbow"
            aria-label="自定义颜色"
            aria-pressed={colorIdx === -1}
            onClick={() => {
              setTool("pen");
              customColorRef.current?.click();
            }}
          />
          {SKETCH_PALETTE.map((c, i) => (
            <button
              key={c.hex}
              type="button"
              className={"pm-sk-sw" + (colorIdx === i ? " on" : "")}
              style={{ background: c.hex }}
              title={c.name}
              aria-label={`颜色 · ${c.name}`}
              aria-pressed={colorIdx === i}
              onClick={() => {
                setTool("pen");
                setColorIdx(i);
                setColorHex(c.hex);
              }}
            />
          ))}
        </div>

        <button
          type="button"
          className={
            "pm-sk-use" +
            (hasInk && !busy ? " ready" : "") +
            (busy ? " busy" : "")
          }
          aria-label={busy ? "正在准备" : "使用草图"}
          title={busy ? "正在准备…" : "使用草图"}
          disabled={!hasInk || busy}
          onClick={props.onConfirm}
        >
          {busy ? <Loader2 size={21} /> : <Check size={21} />}
        </button>

        <p className="pm-sk-meta">{props.meta}</p>
      </div>
    </div>
  );
}
