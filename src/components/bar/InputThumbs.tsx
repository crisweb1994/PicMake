/** 输入图缩略图条：预览、草图/选区入口、移除；含「移除选区」 */
import { Pencil } from "lucide-react";
import type { DisplayInput, InpaintBarInfo } from "../../lib/view-models";

export function InputThumbs(props: {
  images: DisplayInput[];
  reading: boolean;
  /** 局部重绘投影；无选区为 null */
  inpaint: InpaintBarInfo | null;
  onRemove: (id: string) => void;
  onPreview: (id: string) => void;
  onEditSketch: (id: string) => void;
  onStartInpaint: (id: string) => void;
  onEditMask: () => void;
  onRemoveMask: () => void;
}) {
  const { inpaint } = props;
  return (
    <div className="pm-bar-thumbs">
      {props.images.map((image, index) => {
        const role = image.inpaintRole;
        return (
          <div
            className={"pm-bar-thumb" + (role === "mask" ? " mask" : "")}
            key={image.id}
          >
            <button
              type="button"
              className={image.isSketch ? "sk" : ""}
              aria-label={
                image.isSketch ? `编辑图${index + 1}草图` : `预览图${index + 1}`
              }
              disabled={!image.url}
              onClick={() =>
                image.isSketch
                  ? props.onEditSketch(image.id)
                  : props.onPreview(image.id)
              }
            >
              {image.url ? (
                <img
                  src={image.url}
                  alt={image.isSketch ? `图${index + 1} 草图` : image.name}
                />
              ) : (
                <span>不可用</span>
              )}
            </button>
            <span className="no">{index + 1}</span>
            {role === "mask" && <span className="sel-badge">已选区域</span>}
            {(image.isSketch || role !== "ref") && (
              <button
                type="button"
                className="pen act"
                aria-label={
                  image.isSketch
                    ? `继续画图${index + 1}草图`
                    : role === "mask"
                      ? "修改选区"
                      : `对图${index + 1}发起局部重绘`
                }
                title={
                  image.isSketch
                    ? "继续画这张草图"
                    : role === "mask"
                      ? "修改选区"
                      : "局部重绘：涂选这张图的修改区域"
                }
                disabled={props.reading}
                onClick={(e) => {
                  e.stopPropagation();
                  if (image.isSketch) props.onEditSketch(image.id);
                  else if (role === "mask") props.onEditMask();
                  else props.onStartInpaint(image.id);
                }}
              >
                <Pencil size={9} />
              </button>
            )}
            <button
              type="button"
              className="rm"
              aria-label={`移除图${index + 1}`}
              onClick={() => props.onRemove(image.id)}
            >
              ×
            </button>
          </div>
        );
      })}
      {inpaint && (
        <button
          type="button"
          className="pm-bar-rmmask"
          title="保留底图、描述与参数，切换为普通图片编辑"
          onClick={props.onRemoveMask}
        >
          移除选区
        </button>
      )}
    </div>
  );
}
