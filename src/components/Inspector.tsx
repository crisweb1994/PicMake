/** 右坞 Inspector（PRD §5.2）：生成面板 / 本次生成详情，双模式，纯展示 */
import { useRef, useState, type ReactNode, type RefObject } from "react";
import { Button, TextArea } from "@heroui/react";
import { fmtDuration, fmtTime } from "../lib/format";
import {
  BASE_LABELS,
  MODEL_LABELS,
  QUALITY_LABELS,
  RATIO_CHIPS,
  sizeText,
  isCustomActive,
  type GenForm,
} from "../lib/params";
import type { DisplayGen } from "../lib/view-models";
import type { InputFidelity } from "../lib/types";
import { Segmented, Stepper } from "./controls";

function Section(props: {
  label: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="pm-sec">
      <div className="pm-sec-lb">
        {props.label}
        {props.right != null && <span className="r">{props.right}</span>}
      </div>
      {props.children}
    </section>
  );
}

export function GeneratePanel(props: {
  sourceUrl?: string;
  inputFidelity?: InputFidelity;
  onInputFidelity: (value: InputFidelity) => void;
  onCloseEdit: () => void;
  form: GenForm;
  customValid: boolean;
  generating: boolean;
  promptRef: RefObject<HTMLTextAreaElement | null>;
  onPatch: (patch: Partial<GenForm>) => void;
  onGenerate: () => void;
}) {
  const { form: f, onPatch } = props;
  const usingCustom = isCustomActive(f);
  const [customOpen, setCustomOpen] = useState(isCustomActive(f));
  const whRef = useRef<HTMLDivElement>(null);
  return (
    <div className="pm-insp-scroll">
      {props.inputFidelity && (
        <>
          <div className="pm-edit-source">
            {props.sourceUrl ? (
              <img src={props.sourceUrl} alt="编辑来源" />
            ) : (
              <span className="pm-source-placeholder">暂无预览</span>
            )}
            <span>编辑此图</span>
            <button
              type="button"
              aria-label="退出编辑"
              onClick={props.onCloseEdit}
            >
              ×
            </button>
          </div>
          <Section label="保留原图">
            <Segmented
              ariaLabel="保留原图"
              value={props.inputFidelity}
              disabled={props.generating}
              onChange={props.onInputFidelity}
              options={[
                { value: "low", label: "低" },
                { value: "high", label: "高" },
              ]}
            />
          </Section>
        </>
      )}
      <fieldset className="pm-form-fields" disabled={props.generating}>
        <Section label="模型">
          <Segmented
            full
            ariaLabel="模型"
            value={f.model}
            onChange={(model) => onPatch({ model })}
            options={[
              { value: "flare", label: "Flare 快速" },
              { value: "sunburst", label: "Sunburst 精细" },
            ]}
          />
        </Section>

        <Section label="生成">
          <TextArea
            aria-label="画面描述"
            maxLength={32000}
            value={f.prompt}
            ref={props.promptRef}
            onChange={(e) => onPatch({ prompt: e.target.value })}
            placeholder="描述你想要的画面，比如：雪夜的山顶小屋，一盏暖灯"
            className="pm-textarea"
          />
        </Section>

        <Section label="尺寸">
          <div className="pm-chips4">
            {RATIO_CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                className="pm-chip4"
                aria-pressed={!usingCustom && f.ratio === c.id}
                onClick={() => {
                  onPatch({ ratio: c.id, cw: "", ch: "" });
                  setCustomOpen(false);
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div
            className={
              "pm-lrow" + (f.ratio === "auto" || usingCustom ? " off" : "")
            }
          >
            <span className="pm-mini-lb">基准</span>
            <Segmented
              mini
              ariaLabel="基准分辨率"
              value={f.base}
              disabled={f.ratio === "auto" || usingCustom}
              onChange={(base) => onPatch({ base })}
              options={BASE_LABELS.map((b) => ({
                value: b.id,
                label: b.label,
              }))}
            />
          </div>
          <div className="pm-lrow">
            <span className="pm-mini-lb">自定义</span>
            {customOpen || usingCustom ? (
              <div className="pm-wh" ref={whRef}>
                <input
                  type="number"
                  min={256}
                  max={3840}
                  step={16}
                  placeholder="宽"
                  value={f.cw}
                  aria-label="自定义宽度"
                  className={props.customValid ? "" : "bad"}
                  onChange={(e) => onPatch({ cw: e.target.value })}
                  autoFocus
                />
                <span className="x">×</span>
                <input
                  type="number"
                  min={256}
                  max={3840}
                  step={16}
                  placeholder="高"
                  value={f.ch}
                  aria-label="自定义高度"
                  className={props.customValid ? "" : "bad"}
                  onChange={(e) => onPatch({ ch: e.target.value })}
                />
                <span className="x">px</span>
                <button
                  type="button"
                  className="pm-wh-x"
                  aria-label="收起自定义宽高"
                  onClick={() => {
                    onPatch({ cw: "", ch: "" });
                    setCustomOpen(false);
                  }}
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="pm-selbtn"
                onClick={() => {
                  setCustomOpen(true);
                  requestAnimationFrame(() =>
                    whRef.current?.querySelector("input")?.focus(),
                  );
                }}
              >
                宽 × 高… <span className="caret">▾</span>
              </button>
            )}
          </div>
          <p className="pm-hint">
            宽高须被 16 整除 · 比例 1:3 ～ 3:1 · ≤ 3840 × 2160
          </p>
        </Section>

        <Section label="质量">
          <Segmented
            ariaLabel="质量"
            value={f.quality}
            onChange={(quality) => onPatch({ quality })}
            options={[
              { value: "low", label: "低" },
              { value: "medium", label: "中" },
              { value: "high", label: "高" },
              { value: "xhigh", label: "超高" },
              { value: "max", label: "最高" },
            ]}
          />
        </Section>

        <Section label="数量与背景">
          <div className="pm-row">
            <Stepper
              value={f.n}
              min={1}
              max={4}
              onChange={(n) => onPatch({ n })}
              ariaLabel="生成张数"
            />
            <Segmented
              ariaLabel="背景"
              value={f.bg}
              onChange={(bg) =>
                onPatch(
                  bg === "transparent" && f.fmt === "jpeg"
                    ? { bg, fmt: "png" }
                    : { bg },
                )
              }
              options={[
                { value: "auto", label: "自动" },
                { value: "transparent", label: "透明" },
                { value: "opaque", label: "纯色" },
              ]}
            />
          </div>
        </Section>

        <Section label="输出格式">
          <Segmented
            ariaLabel="输出格式"
            value={f.fmt}
            onChange={(fmt) => onPatch({ fmt })}
            options={
              f.bg === "transparent"
                ? [
                    { value: "png", label: "PNG" },
                    { value: "webp", label: "WebP" },
                  ]
                : [
                    { value: "png", label: "PNG" },
                    { value: "jpeg", label: "JPEG" },
                    { value: "webp", label: "WebP" },
                  ]
            }
          />
        </Section>
      </fieldset>
      <div className="pm-insp-foot">
        <Button
          variant="primary"
          fullWidth
          isDisabled={props.generating}
          onPress={props.onGenerate}
        >
          {props.generating
            ? "正在生成…"
            : props.inputFidelity
              ? "生成编辑结果"
              : "生成图片"}
        </Button>
      </div>
    </div>
  );
}

export function DetailPanel(props: {
  display: DisplayGen;
  selectedImageId: string | null;
  canEdit: boolean;
  sourceUrl?: string;
  sourceExists: boolean;
  onViewSource: () => void;
  onDownload: () => void;
  onCopyPrompt: () => void;
  onReuse: () => void;
  onEdit: (imageId: string) => void;
  onDelete: () => void;
  onNew: () => void;
}) {
  const { row, images } = props.display;
  const p = row.params;
  return (
    <>
      <div className="pm-insp-scroll">
        <Section
          label="本次生成"
          right={<span className="r">{fmtTime(row.createdAt)}</span>}
        >
          <div className="pm-ichips">
            <span className="pm-ichip">
              模型 <b>{MODEL_LABELS[p.model]}</b>
            </span>
            <span className="pm-ichip">
              尺寸 <b>{sizeText(p.size)}</b>
            </span>
            <span className="pm-ichip">
              质量 <b>{QUALITY_LABELS[p.quality]}</b>
            </span>
            <span className="pm-ichip">
              张数 <b>{images.length}</b>
            </span>
            <span className="pm-ichip">
              <b>{p.outputFormat.toUpperCase()}</b>
            </span>
          </div>
        </Section>

        <Section
          label="画面描述"
          right={
            <button
              type="button"
              className="pm-pill-act"
              onClick={props.onCopyPrompt}
            >
              复制
            </button>
          }
        >
          <div className="pm-prompt-card">{row.prompt}</div>
        </Section>

        {row.editSource && (
          <Section label="来源作品">
            <div className="pm-edit-source">
              <button
                type="button"
                className="pm-source-thumb"
                disabled={!props.sourceUrl}
                aria-label="查看来源图片"
                onClick={props.onViewSource}
              >
                {props.sourceUrl ? (
                  <img src={props.sourceUrl} alt="来源作品" />
                ) : (
                  <span>图片不可用</span>
                )}
              </button>
              <span>
                {props.sourceExists ? "基于此图编辑" : "来源作品已删除"}
              </span>
              {props.sourceUrl && (
                <button type="button" onClick={props.onViewSource}>
                  查看
                </button>
              )}
            </div>
            <p className="pm-hint">
              保留原图 · {row.editSource.inputFidelity === "high" ? "高" : "低"}
            </p>
          </Section>
        )}
        <Section label="操作">
          <div className="pm-act3">
            <button type="button" className="pri" onClick={props.onDownload}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              下载
            </button>
            <button
              type="button"
              disabled={!props.selectedImageId || !props.canEdit}
              onClick={() =>
                props.selectedImageId && props.onEdit(props.selectedImageId)
              }
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              编辑此图
            </button>
            <button type="button" onClick={props.onReuse}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              复用参数
            </button>
          </div>
          {!props.selectedImageId && (
            <p className="pm-hint">先点开一张图片，再编辑此图。</p>
          )}
          {!props.canEdit && (
            <p className="pm-hint">本地保存成功后才能继续编辑。</p>
          )}
          <button
            type="button"
            className="pm-del-line"
            onClick={props.onDelete}
          >
            删除这次生成
          </button>
        </Section>

        <div className="pm-usage-line">
          <span>
            耗时 <b>{fmtDuration(row.durationMs)}</b>
          </span>
        </div>
      </div>
      <div className="pm-insp-foot">
        <Button variant="primary" fullWidth onPress={props.onNew}>
          新建生成
        </Button>
      </div>
    </>
  );
}
