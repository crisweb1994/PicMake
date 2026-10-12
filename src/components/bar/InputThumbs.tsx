/** 输入图缩略图条：预览、草图/选区入口、移除；含「移除选区」 */
import { useTranslation } from "react-i18next";
import { Pencil } from "lucide-react";
import { inputName } from "../../i18n/labels";
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
  const { t } = useTranslation();
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
                image.isSketch
                  ? t("input.editSketch", { index: index + 1 })
                  : t("input.preview", { index: index + 1 })
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
                  alt={
                    image.isSketch
                      ? t("input.sketchAlt", { index: index + 1 })
                      : inputName(image.naming, t)
                  }
                />
              ) : (
                <span>{t("common.unavailable")}</span>
              )}
            </button>
            <span className="no">{index + 1}</span>
            {role === "mask" && (
              <span className="sel-badge">{t("input.maskBadge")}</span>
            )}
            {(image.isSketch || role !== "ref") && (
              <button
                type="button"
                className="pen act"
                aria-label={
                  image.isSketch
                    ? t("input.continueSketchAria", { index: index + 1 })
                    : role === "mask"
                      ? t("input.editMask")
                      : t("input.inpaintAria", { index: index + 1 })
                }
                title={
                  image.isSketch
                    ? t("input.continueSketchTitle")
                    : role === "mask"
                      ? t("input.editMask")
                      : t("input.inpaintTitle")
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
              aria-label={t("input.remove", { index: index + 1 })}
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
          title={t("input.removeMaskTitle")}
          onClick={props.onRemoveMask}
        >
          {t("input.removeMask")}
        </button>
      )}
    </div>
  );
}
