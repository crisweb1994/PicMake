/** 局部重绘选区编辑器（PRD_INPAINTING IP-04～IP-07，交互对照 docs/demos/inpaint-demo.html）：
 *  弹层涂选——画笔/擦除/粗细（底图像素单位）、撤销/重做/清空、隐藏选区（隐藏时禁止涂画）、
 *  缩放 1×–8×（0.25 步长，相对适应窗口）与拖动画布平移、圆形笔刷光标、右下「使用选区」。
 *  受控展示组件：文档、撤销游标与确认态由 useInpaint 持有；工具、缩放、平移、光标、
 *  进行中笔触为组件内部交互状态。坐标以底图像素为逻辑单位，缩放不改已有笔宽。
 *  背景点击与 Esc 不关闭（FR-9）；有未确认修改时关闭由接线层确认；焦点圈闭并在关闭后还原。
 *
 *  副作用清单：ResizeObserver(stage)、画笔初始焦点 rAF、指针捕获（stage），
 *  均随卸载清理；进行中笔触只画进 Canvas，松手才提交一个完整命令。 */
import { FocusScope } from "react-aria";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Brush,
  Check,
  Eraser,
  Eye,
  EyeOff,
  Hand,
  Loader2,
  Maximize,
  Minus,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import {
  INPAINT_ISSUE_HINTS,
  type InpaintIssue,
  type MaskCommand,
  type MaskDocument,
  type MaskStroke,
  type SketchPoint,
} from "../lib/types";
import { SKETCH_MAX_COMMANDS, SKETCH_MAX_POINTS } from "../lib/sketch";
import {
  makeMaskStroke,
  maskBrushRange,
  totalMaskPoints,
} from "../lib/inpaint";
import {
  maskHasSelectionQuick,
  paintOverlayLayer,
} from "../lib/inpaint-canvas";

/** 显示覆盖层颜色（IP-04：专用令牌 --pm-inpaint-*，两主题可辨）。
 *  Canvas 不支持 CSS 变量：从根元素解析令牌值，缺省回退品牌强调色。 */
function overlayFill(): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--pm-inpaint-fill")
    .trim();
  return value || "#FF9A62";
}

interface BoardBox {
  fitW: number;
  fitH: number;
  dpr: number;
  left: number;
  top: number;
}

export function InpaintModal(props: {
  baseUrl: string;
  name: string;
  baseW: number;
  baseH: number;
  /** D1 归一化发生时的提示 */
  normalized: boolean;
  doc: MaskDocument;
  cursor: number;
  confirming: boolean;
  error: InpaintIssue | null;
  onStroke: (command: MaskCommand) => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onConfirm: () => void;
  /** 关闭请求（是否有未确认修改由接线层判断并拦截） */
  onRequestClose: () => void;
  onLimit: (kind: "commands" | "points") => void;
}) {
  const { doc, cursor } = props;
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const covRef = useRef<HTMLCanvasElement>(null);
  const cursorRingRef = useRef<HTMLDivElement>(null);
  const penBtnRef = useRef<HTMLButtonElement>(null);
  const drawingRef = useRef<{
    pid: number;
    cmd: MaskStroke;
    last: SketchPoint;
  } | null>(null);
  const panningRef = useRef<{ pid: number; x: number; y: number } | null>(null);
  const ptsWarnedRef = useRef(false);
  const [tool, setTool] = useState<"pen" | "eraser" | "pan">("pen");
  const [brush, setBrush] = useState(
    () => maskBrushRange(doc.width, doc.height).initial,
  );
  const [overlayHidden, setOverlayHidden] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [box, setBox] = useState<BoardBox | null>(null);
  const [hasSelection, setHasSelection] = useState(false);

  const brushRange = maskBrushRange(doc.width, doc.height);

  /* ── 布局：contain 完整容纳底图（避开四周浮动控件），记为 1×（适应窗口）。
   *  布局变化保留选区坐标（文档坐标不变），仅复位视图（IP-06：resize 不丢选区） ── */
  const fit = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const narrow = sw < 760;
    const pad = narrow ? 28 : 56;
    const bottomPad = narrow ? 92 : 104;
    const aw = Math.max(80, sw - pad * 2);
    const ah = Math.max(80, sh - 64 - bottomPad);
    const r = doc.width / doc.height;
    let w = aw;
    let h = w / r;
    if (h > ah) {
      h = ah;
      w = h * r;
    }
    const left = pad + (aw - w) / 2;
    const top = 64 + (ah - h) / 2;
    setBox({
      fitW: w,
      fitH: h,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      left,
      top,
    });
    setZoom(1);
    setPan({ x: left, y: top });
  }, [doc.width, doc.height]);

  useLayoutEffect(() => {
    fit();
    const ro = new ResizeObserver(fit);
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [fit]);

  /* ── 显示层立即模式重绘：clear → 已提交命令 → 进行中笔触（tldraw 同思路）。
   *  每帧全量重画同一 perfect-freehand 轮廓，无增量合成 → 无衰减、无接缝；
   *  显示与判空/导出共用 drawMaskCommand，请求范围与所见范围同构（D5）── */
  const renderDisplay = useCallback(
    (live: MaskStroke | null) => {
      const cov = covRef.current;
      const ctx = cov?.getContext("2d");
      if (!cov || !ctx || !box) return;
      paintOverlayLayer(
        ctx,
        doc,
        cursor,
        live,
        cov.width / doc.width,
        overlayFill(),
      );
    },
    [doc, cursor, box],
  );

  useEffect(() => {
    renderDisplay(null);
    setHasSelection(maskHasSelectionQuick(doc, cursor));
  }, [doc, cursor, box, renderDisplay]);

  // FocusScope 负责限制与恢复焦点；进入时仍聚焦画笔。
  useEffect(() => {
    const frame = requestAnimationFrame(() => penBtnRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  /* ── 缩放 / 平移：围绕视口中心，0.25 步长，1×–8×；平移只改视图 ──
     pan 即画布左上角在舞台内的坐标；钳制保证至少 margin px 留在可视区（IP-06） */
  const clampPan = useCallback(
    (next: { x: number; y: number }, z: number, b: BoardBox) => {
      const stage = stageRef.current;
      if (!stage) return next;
      const w = b.fitW * z;
      const h = b.fitH * z;
      const margin = 48;
      const clamp = (pos: number, size: number, view: number) =>
        Math.min(view - margin, Math.max(margin - size, pos));
      return {
        x: clamp(next.x, w, stage.clientWidth),
        y: clamp(next.y, h, stage.clientHeight),
      };
    },
    [],
  );

  const applyZoom = useCallback(
    (step: number) => {
      setZoom((z) => {
        const nz = Math.min(8, Math.max(1, Math.round((z + step) * 4) / 4));
        if (nz === z || !box || !stageRef.current) return z;
        const stage = stageRef.current.getBoundingClientRect();
        const frame = frameRef.current?.getBoundingClientRect();
        if (!frame) return z;
        const cx = stage.left + stage.width / 2;
        const cy = stage.top + stage.height / 2;
        const ix = (cx - frame.left) / frame.width;
        const iy = (cy - frame.top) / frame.height;
        setPan(() => {
          const raw = {
            x: cx - stage.left - ix * box.fitW * nz,
            y: cy - stage.top - iy * box.fitH * nz,
          };
          return clampPan(raw, nz, box);
        });
        return nz;
      });
    },
    [box, clampPan],
  );

  const fitView = useCallback(() => {
    setZoom(1);
    if (box) setPan({ x: box.left, y: box.top });
  }, [box]);

  /* ── 指针：一笔一命令；pan 工具拖画布；图片留白不接受画笔 ── */
  const toDocPoint = (clientX: number, clientY: number): SketchPoint | null => {
    const frame = frameRef.current?.getBoundingClientRect();
    if (!frame) return null;
    const x = ((clientX - frame.left) / frame.width) * doc.width;
    const y = ((clientY - frame.top) / frame.height) * doc.height;
    // 图片外留白不创建笔触：越界（±2px 容差）直接放弃本次事件
    if (x < -2 || y < -2 || x > doc.width + 2 || y > doc.height + 2)
      return null;
    return {
      x: Math.min(doc.width, Math.max(0, x)),
      y: Math.min(doc.height, Math.max(0, y)),
    };
  };

  /** rAF 节流的全量重绘调度：拖动期间每帧重画已提交 + 当前笔触 */
  const rafRef = useRef(0);
  const scheduleRender = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      renderDisplay(drawingRef.current?.cmd ?? null);
    });
  }, [renderDisplay]);
  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const moveCursorRing = useCallback(
    (clientX: number, clientY: number) => {
      const ring = cursorRingRef.current;
      const frame = frameRef.current?.getBoundingClientRect();
      const stage = stageRef.current?.getBoundingClientRect();
      if (!ring || !frame || !stage || tool === "pan" || overlayHidden) {
        if (ring) ring.style.display = "none";
        return;
      }
      if (
        clientX < frame.left ||
        clientX > frame.right ||
        clientY < frame.top ||
        clientY > frame.bottom
      ) {
        ring.style.display = "none";
        return;
      }
      const d = brush * (frame.width / doc.width);
      ring.style.display = "block";
      ring.style.width = `${d}px`;
      ring.style.height = `${d}px`;
      ring.style.left = `${clientX - stage.left - d / 2}px`;
      ring.style.top = `${clientY - stage.top - d / 2}px`;
    },
    [tool, overlayHidden, brush, doc.width],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (props.confirming) return;
    if (drawingRef.current || panningRef.current) {
      // 多指：终止未完成笔触，不触发新手势（TECH §6.1）
      if (drawingRef.current) {
        drawingRef.current = null;
        renderDisplay(null);
      }
      return;
    }
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (tool === "pan") {
      panningRef.current = { pid: e.pointerId, x: e.clientX, y: e.clientY };
      try {
        stageRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* 无活动指针时降级为普通跟踪 */
      }
      return;
    }
    if (overlayHidden) return; // 隐藏选区时禁止涂画，避免盲操作（IP-04）
    if (doc.commands.length >= SKETCH_MAX_COMMANDS) {
      props.onLimit("commands");
      return;
    }
    const pt = toDocPoint(e.clientX, e.clientY);
    if (!pt) return;
    const cmd = makeMaskStroke(tool === "eraser" ? "eraser" : "pen", brush);
    cmd.points.push(pt);
    drawingRef.current = { pid: e.pointerId, cmd, last: pt };
    try {
      stageRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* 无活动指针时降级为普通跟踪 */
    }
    renderDisplay(cmd);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    moveCursorRing(e.clientX, e.clientY);
    const pan0 = panningRef.current;
    if (pan0) {
      if (e.pointerId !== pan0.pid) return;
      setPan((p) => {
        const raw = {
          x: p.x + e.clientX - pan0.x,
          y: p.y + e.clientY - pan0.y,
        };
        return box ? clampPan(raw, zoom, box) : raw;
      });
      panningRef.current = { ...pan0, x: e.clientX, y: e.clientY };
      return;
    }
    const d = drawingRef.current;
    if (!d || e.pointerId !== d.pid) return;
    const pt = toDocPoint(e.clientX, e.clientY);
    if (!pt) return;
    // perfect-freehand 的 streamline 负责抖动平滑；此处只做极小距离去重
    if (Math.hypot(pt.x - d.last.x, pt.y - d.last.y) < 0.8) return;
    if (
      totalMaskPoints(doc, cursor) + d.cmd.points.length >=
      SKETCH_MAX_POINTS
    ) {
      if (!ptsWarnedRef.current) {
        ptsWarnedRef.current = true;
        props.onLimit("points");
      }
      return;
    }
    d.cmd.points.push(pt);
    d.last = pt;
    scheduleRender();
  };

  const endDraw = (e: React.PointerEvent, discard: boolean) => {
    const pan0 = panningRef.current;
    if (pan0 && e.pointerId === pan0.pid) {
      panningRef.current = null;
      return;
    }
    const d = drawingRef.current;
    if (!d || e.pointerId !== d.pid) return;
    drawingRef.current = null;
    if (discard) {
      renderDisplay(null); // 指针中断：丢弃未完成的一笔（IP-05）
      return;
    }
    props.onStroke(d.cmd);
  };

  const canUndo = cursor > 0;
  const canRedo = cursor < doc.commands.length;
  const busy = props.confirming;

  const frameStyle = box
    ? {
        left: pan.x,
        top: pan.y,
        width: box.fitW * zoom,
        height: box.fitH * zoom,
      }
    : undefined;

  return (
    <FocusScope contain restoreFocus>
      <div className="pm-ip-overlay">
        <div
          className="pm-ip-board"
          role="dialog"
          aria-modal="true"
          aria-label="选择修改区域"
        >
          <div
            className={"pm-ip-stage" + (tool === "pan" ? " panning" : "")}
            ref={stageRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => endDraw(e, false)}
            onPointerCancel={(e) => endDraw(e, true)}
            onLostPointerCapture={(e) => endDraw(e, true)}
          >
            {box && frameStyle && (
              <div className="pm-ip-frame" ref={frameRef} style={frameStyle}>
                <img
                  src={props.baseUrl}
                  alt={props.name}
                  draggable={false}
                  onLoad={() => renderDisplay(null)}
                />
                <canvas
                  ref={covRef}
                  className={"pm-ip-cov" + (overlayHidden ? " hidden" : "")}
                  width={Math.round(box.fitW * box.dpr)}
                  height={Math.round(box.fitH * box.dpr)}
                  aria-hidden
                />
              </div>
            )}
            <div
              className="pm-ip-ring"
              ref={cursorRingRef}
              style={{ display: "none" }}
            />
          </div>

          <button
            type="button"
            className="pm-ip-close"
            aria-label="关闭"
            disabled={busy}
            onClick={props.onRequestClose}
          >
            <X size={18} />
          </button>

          <div className="pm-ip-title">
            <b>选择修改区域</b>
            <span className="name">{props.name}</span>
            <span className="dims">
              {props.baseW} × {props.baseH} px
            </span>
            {props.normalized && (
              <span className="norm">已校正图片方向，原文件保留</span>
            )}
          </div>

          <div className="pm-ip-hist" role="group" aria-label="撤销重做与显隐">
            <button
              type="button"
              aria-label="撤销"
              disabled={!canUndo || busy}
              onClick={props.onUndo}
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              aria-label="重做"
              disabled={!canRedo || busy}
              onClick={props.onRedo}
            >
              <Redo2 size={16} />
            </button>
            <button
              type="button"
              aria-label="清空选区"
              disabled={!hasSelection || busy}
              onClick={props.onClear}
            >
              <Trash2 size={16} />
            </button>
            <span className="vr" />
            <button
              type="button"
              aria-pressed={overlayHidden}
              disabled={busy}
              title={
                overlayHidden
                  ? "显示选区"
                  : "隐藏选区（隐藏时暂停涂画，不清空）"
              }
              onClick={() => setOverlayHidden((v) => !v)}
            >
              {overlayHidden ? <EyeOff size={16} /> : <Eye size={16} />}
              {overlayHidden ? "显示选区" : "隐藏选区"}
            </button>
          </div>

          <div className="pm-ip-zoombar" role="group" aria-label="缩放与平移">
            <button
              type="button"
              aria-label="缩小"
              disabled={zoom <= 1 || busy}
              onClick={() => applyZoom(-0.25)}
            >
              <Minus size={14} />
            </button>
            <b>{Math.round(zoom * 100)}%</b>
            <button
              type="button"
              aria-label="放大"
              disabled={zoom >= 8 || busy}
              onClick={() => applyZoom(0.25)}
            >
              <Plus size={14} />
            </button>
            <button type="button" onClick={fitView} disabled={busy}>
              <Maximize size={14} />
              适应窗口
            </button>
            <button
              type="button"
              className={tool === "pan" ? "on" : ""}
              aria-pressed={tool === "pan"}
              title="拖动画布平移视图，不影响选区"
              onClick={() => setTool((t) => (t === "pan" ? "pen" : "pan"))}
            >
              <Hand size={14} />
              拖动画布
            </button>
          </div>

          <div className="pm-ip-tools" role="toolbar" aria-label="绘画工具">
            <button
              type="button"
              ref={penBtnRef}
              className={tool === "pen" ? "on" : ""}
              aria-label="画笔"
              aria-pressed={tool === "pen"}
              title="画笔：扩大待修改区域"
              disabled={busy}
              onClick={() => setTool("pen")}
            >
              <Brush size={15} />
              画笔
            </button>
            <button
              type="button"
              className={tool === "eraser" ? "on" : ""}
              aria-label="擦除"
              aria-pressed={tool === "eraser"}
              title="擦除：缩小待修改区域，不擦除原图"
              disabled={busy}
              onClick={() => setTool("eraser")}
            >
              <Eraser size={15} />
              擦除
            </button>
            <span className="vr" />
            <label className="pm-ip-size">
              粗细
              <input
                type="range"
                aria-label="画笔粗细（底图像素）"
                min={brushRange.min}
                max={brushRange.max}
                step={1}
                value={brush}
                onChange={(e) => setBrush(Number(e.target.value))}
              />
              <input
                type="number"
                aria-label="画笔粗细数值"
                min={brushRange.min}
                max={brushRange.max}
                step={1}
                value={brush}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n))
                    setBrush(
                      Math.min(
                        brushRange.max,
                        Math.max(brushRange.min, Math.round(n)),
                      ),
                    );
                }}
              />
              px
            </label>
          </div>

          {props.error && (
            <p className="pm-ip-error" role="alert">
              {INPAINT_ISSUE_HINTS[props.error]}
            </p>
          )}
          {!props.error && !hasSelection && !busy && (
            <p className="pm-ip-hint">请先涂选需要修改的区域</p>
          )}

          <button
            type="button"
            className={"pm-ip-use" + (hasSelection && !busy ? " ready" : "")}
            disabled={!hasSelection || busy}
            onClick={props.onConfirm}
          >
            {busy ? <Loader2 size={16} /> : <Check size={16} />}
            {busy ? "处理中…" : "使用选区"}
          </button>
        </div>
      </div>
    </FocusScope>
  );
}

/** 只读选区查看（IP-15）：实际请求底图 + 已保存选区叠加，可显隐、可发起「调整上次重绘」。 */
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
    const measure = () => {
      const w = wrapRef.current?.clientWidth ?? 720;
      setWidth(Math.max(240, Math.min(920, w - 8)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
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
