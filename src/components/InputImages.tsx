/** 图片列表只负责展示和选择事件；上传/来源读取由页面 hook 处理。 */
import { useRef } from "react";
import { Button } from "@heroui/react";
import type { DisplayInput } from "../lib/view-models";
import { MAX_INPUT_IMAGES } from "../lib/types";

export function InputImages(props: {
  images: DisplayInput[];
  onPreview: (id: string) => void;
  onFiles?: (files: File[]) => void;
  onRemove?: (id: string) => void;
  onClear?: () => void;
  disabled?: boolean;
  reading?: boolean;
  error?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const editable = !!props.onFiles;
  return (
    <section className="pm-sec">
      <div className="pm-sec-lb">
        <span>输入图片{editable && "（可选）"}</span>
        <span className="r">
          {props.images.length}
          {editable && ` / ${MAX_INPUT_IMAGES}`}
        </span>
      </div>
      <div className="pm-input-grid">
        {props.images.map((image, index) => (
          <div className="pm-input-item" key={image.id}>
            <button
              type="button"
              className="pm-input-thumb"
              aria-label={`预览图${index + 1}`}
              disabled={props.disabled || !image.url}
              onClick={() => props.onPreview(image.id)}
            >
              {image.url ? (
                <img src={image.url} alt={image.name} />
              ) : (
                <span>图片不可用</span>
              )}
            </button>
            <span className="pm-input-name" title={image.name}>
              图{index + 1} · {image.name}
            </span>
            {image.origin && (
              <span className="pm-input-origin">{image.origin}</span>
            )}
            {props.onRemove && (
              <button
                type="button"
                className="pm-input-remove"
                aria-label={`移除图${index + 1}`}
                disabled={props.disabled}
                onClick={() => props.onRemove?.(image.id)}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {editable && (
        <>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            hidden
            disabled={props.disabled}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length) props.onFiles?.(files);
            }}
          />
          <Button
            variant="secondary"
            fullWidth
            isDisabled={
              props.disabled || props.images.length >= MAX_INPUT_IMAGES
            }
            onPress={() => fileRef.current?.click()}
          >
            {props.reading
              ? "正在读取图片…"
              : props.images.length
                ? "添加图片"
                : "上传图片编辑"}
          </Button>
          {!!props.images.length && (
            <button
              type="button"
              className="pm-pill-act pm-input-clear"
              disabled={props.disabled}
              onClick={props.onClear}
            >
              全部移除
            </button>
          )}
          <p className="pm-hint">
            PNG、JPEG、WebP · 每张小于 50 MiB · 最多 16 张
          </p>
          <p className="pm-hint">
            未提交的图片仅保留在当前页面。可在描述中用图1、图2指定图片。
          </p>
        </>
      )}
      {props.error && (
        <p className="pm-input-error" role="alert">
          {props.error}
        </p>
      )}
    </section>
  );
}
