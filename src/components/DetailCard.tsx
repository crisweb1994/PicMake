/** 舞台右上详情浮卡（PRD §5.2，2026-09-23）：承接原右坞「本次生成详情」，纯展示。 */
import { X } from "lucide-react";
import { fmtDuration, fmtTime } from "../lib/format";
import { MODEL_LABELS, QUALITY_LABELS, sizeText } from "../lib/params";
import type { DisplayGen, DisplayInput } from "../lib/view-models";

export function DetailCard(props: {
  display: DisplayGen;
  selectedImageId: string | null;
  canEdit: boolean;
  sources: DisplayInput[];
  onViewSource: (id: string) => void;
  onDownload: () => void;
  onCopyPrompt: () => void;
  onReuse: () => void;
  onEdit: (imageId: string) => void;
  onDelete: () => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const { row, images } = props.display;
  const p = row.params;
  const editImageId = props.selectedImageId ?? images[0]?.id ?? null;
  return (
    <aside className="pm-island pm-detail" aria-label="本次生成详情">
      <header className="pm-detail-cap">
        <b>本次生成</b>
        <span className="t">{fmtTime(row.createdAt)}</span>
        <button type="button" aria-label="收起详情" onClick={props.onClose}>
          <X size={12} />
        </button>
      </header>
      <div className="pm-detail-chips">
        <span className="pm-detail-chip">模型 <b>{MODEL_LABELS[p.model]}</b></span>
        <span className="pm-detail-chip">尺寸 <b>{sizeText(p.size)}</b></span>
        <span className="pm-detail-chip">质量 <b>{QUALITY_LABELS[p.quality]}</b></span>
        <span className="pm-detail-chip">张数 <b>{images.length}</b></span>
        <span className="pm-detail-chip"><b>{p.outputFormat.toUpperCase()}</b></span>
      </div>
      <div className="pm-detail-promptcap">
        <span>画面描述</span>
        <button type="button" onClick={props.onCopyPrompt}>复制</button>
      </div>
      <p className="pm-detail-prompt">{row.prompt}</p>
      {row.originPrompt && row.originPrompt !== row.prompt && (
        <p className="pm-detail-origin">
          <span>原始描述</span>
          {row.originPrompt}
        </p>
      )}
      {!!props.sources.length && (
        <>
          <div className="pm-detail-srcs">
            {props.sources.map((image, index) => (
              <button
                key={image.id}
                type="button"
                className="pm-detail-src"
                aria-label={`预览图${index + 1}`}
                onClick={() => props.onViewSource(image.id)}
              >
                {image.url ? <img src={image.url} alt={image.name} /> : <span>不可用</span>}
              </button>
            ))}
          </div>
          <p className="pm-detail-hint">
            输入来源 {props.sources.length} 张 · 保留原图 ·{" "}
            {row.inputFidelity === "high" ? "高" : "低"}
          </p>
        </>
      )}
      <div className="pm-detail-acts">
        <button type="button" onClick={props.onDownload}>下载</button>
        <button type="button" onClick={props.onReuse}>复用参数</button>
        <button
          type="button"
          disabled={!editImageId || !props.canEdit}
          onClick={() => editImageId && props.onEdit(editImageId)}
        >
          编辑此图
        </button>
      </div>
      {!props.selectedImageId && images.length > 1 && (
        <p className="pm-detail-hint">多张结果可在轮播中选一张，再编辑此图。</p>
      )}
      {!props.canEdit && (
        <p className="pm-detail-hint">本地保存成功后才能继续编辑。</p>
      )}
      <button type="button" className="pm-detail-del" onClick={props.onDelete}>
        删除这次生成
      </button>
      <button type="button" className="pm-detail-new" onClick={props.onNew}>
        新建生成
      </button>
      <p className="pm-detail-dur">耗时 {fmtDuration(row.durationMs)}</p>
    </aside>
  );
}
