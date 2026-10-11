/** 画板层：草图与局部重绘弹层，以及底图准备中的提示；重绘底图 URL 随会话生成与回收 */
import { InpaintModal } from "../components/InpaintModal";
import { SketchModal } from "../components/SketchModal";
import {
  confirmInpaint,
  confirmSketch,
  notifyDrawLimit,
  requestCloseInpaint,
  requestCloseSketch,
} from "../flows/drawing";
import { useObjectUrl } from "../hooks/useObjectUrl";
import { useWorkspace } from "../store/workspace";
import {
  redoDrawing,
  strokeDrawing,
  undoDrawing,
} from "../store/workspace/actions";

export function DrawingLayer() {
  const drawing = useWorkspace((s) => s.drawing);
  const inpaintBaseUrl = useObjectUrl(
    drawing?.kind === "inpaint" ? drawing.base.blob : null,
  );

  return (
    <>
      {drawing?.kind === "sketch" && (
        <SketchModal
          key={drawing.id}
          doc={drawing.doc}
          cursor={drawing.cursor}
          meta={drawing.meta}
          confirming={drawing.confirming}
          onStroke={strokeDrawing}
          onClear={() => strokeDrawing({ type: "clear" })}
          onUndo={undoDrawing}
          onRedo={redoDrawing}
          onConfirm={confirmSketch}
          onRequestClose={requestCloseSketch}
          onLimit={notifyDrawLimit}
        />
      )}
      {drawing?.kind === "inpaint" && inpaintBaseUrl && (
        <InpaintModal
          key={drawing.id}
          baseUrl={inpaintBaseUrl}
          name={drawing.name}
          baseW={drawing.base.width}
          baseH={drawing.base.height}
          normalized={drawing.normalized}
          doc={drawing.doc}
          cursor={drawing.cursor}
          confirming={drawing.confirming}
          error={drawing.error}
          onStroke={strokeDrawing}
          onClear={() => strokeDrawing({ type: "clear" })}
          onUndo={undoDrawing}
          onRedo={redoDrawing}
          onConfirm={confirmInpaint}
          onRequestClose={requestCloseInpaint}
          onLimit={notifyDrawLimit}
        />
      )}
      {drawing?.kind === "opening" && (
        <p className="pm-saving" role="status">
          正在读取底图…
        </p>
      )}
    </>
  );
}
