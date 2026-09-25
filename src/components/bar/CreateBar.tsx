/** 底部值 chip 创作条（PRD §5.2，2026-09-23）：mini / full / generating / complete 四态，纯展示。
 *  定稿对照 docs/demos/redesign/chipbar/final.html；弹层开合为组件内部 UI 状态。
 *  自定义开发：值 chip 与弹层原语见同目录 BarChip.tsx（BarChip / PopRow）。 */
import { useRef, type RefObject } from "react";
import {
  ArrowUp,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { fmtDuration } from "../../lib/format";
import {
  BASE_LABELS,
  DEFAULT_FORM,
  MODEL_LABELS,
  QUALITY_LABELS,
  RATIO_CHIPS,
  formSize,
  isCustomActive,
  type GenForm,
} from "../../lib/params";
import { ratioMismatch } from "../../lib/sketch";
import type { DisplayGen, DisplayInput } from "../../lib/view-models";
import type {
  FidelityChoice,
  ModelId,
  OutputFormat,
  Quality,
} from "../../lib/types";
import { MAX_INPUT_IMAGES } from "../../lib/types";
import { Segmented } from "../controls";
import { BarChip, PopRow } from "./BarChip";

/** ── mini 态：迷你条 + 配置摘要 ── */
function MiniBar(props: {
  form: GenForm;
  disabled: boolean;
  onExpand: () => void;
}) {
  const f = props.form;
  const size = isCustomActive(f)
    ? `${f.cw}×${f.ch}`
    : f.ratio === "auto"
      ? "自动"
      : `${f.ratio} · ${BASE_LABELS.find((b) => b.id === f.base)?.label}`;
  return (
    <div className="pm-bar-mini">
      <div className="pm-bar-mini-row">
        <button
          type="button"
          className="pm-bar-mini-in"
          onClick={props.onExpand}
          disabled={props.disabled}
        >
          描述你想要的画面…
          <i>点此展开参数</i>
        </button>
        <button
          type="button"
          className="pm-bar-go"
          aria-label="展开并生成"
          onClick={props.onExpand}
          disabled={props.disabled}
        >
          <ArrowUp size={15} strokeWidth={2.4} />
        </button>
      </div>
      <p className="pm-bar-mini-meta">
        当前 {MODEL_LABELS[f.model]} · {size} · {QUALITY_LABELS[f.quality]} · ×
        {f.n} · {f.fmt.toUpperCase()} ·{" "}
        {f.bg === "auto"
          ? "自动背景"
          : f.bg === "transparent"
            ? "透明背景"
            : "纯色背景"}
      </p>
    </div>
  );
}

/** ── full 态：附件 + 输入 + 参数 chips ── */
function FullBar(props: {
  form: GenForm;
  customValid: boolean;
  images: DisplayInput[];
  inputFidelity: FidelityChoice;
  reading: boolean;
  uploadError: string;
  generating: boolean;
  canReturn: boolean;
  /** 已确认草图的逻辑尺寸（比例不一致提示用；无草图为 null） */
  sketchSize: { w: number; h: number } | null;
  promptRef: RefObject<HTMLTextAreaElement | null>;
  onPatch: (patch: Partial<GenForm>) => void;
  onGenerate: () => void;
  onFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  onPreview: (id: string) => void;
  /** 打开新画板（菜单「画草图 / 继续画草图」入口） */
  onOpenSketch: () => void;
  /** 点击草图缩略图重新打开画板 */
  onEditSketch: (id: string) => void;
  onInputFidelity: (value: FidelityChoice) => void;
  onReturn: () => void;
}) {
  const { form: f, onPatch } = props;
  const fileRef = useRef<HTMLInputElement>(null);
  const usingCustom = isCustomActive(f);
  const editing = props.images.length > 0;
  const sketchIdx = props.images.findIndex((image) => image.isSketch);
  const hasSketch = sketchIdx >= 0;
  const atMax = props.images.length >= MAX_INPUT_IMAGES;
  const ready =
    !props.generating && !props.reading && f.prompt.trim().length > 0;
  const explicitSize = formSize(f);
  const sizeMismatch =
    !!props.sketchSize &&
    explicitSize !== "auto" &&
    ratioMismatch(explicitSize, props.sketchSize);
  return (
    <div className="pm-bar-full">
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        hidden
        disabled={props.generating || props.reading}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) props.onFiles(files);
        }}
      />
      {!!editing && (
        <div className="pm-bar-thumbs">
          {props.images.map((image, index) => (
            <div className="pm-bar-thumb" key={image.id}>
              <button
                type="button"
                className={image.isSketch ? "sk" : ""}
                aria-label={
                  image.isSketch
                    ? `编辑图${index + 1}草图`
                    : `预览图${index + 1}`
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
              {image.isSketch && (
                <span className="pen" aria-hidden>
                  <Pencil size={9} />
                </span>
              )}
              <button
                type="button"
                className="rm"
                aria-label={`移除图${index + 1}`}
                disabled={props.generating}
                onClick={() => props.onRemove(image.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {props.uploadError && (
        <p className="pm-bar-err" role="alert">
          {props.uploadError}
        </p>
      )}
      <div className="pm-bar-row1">
        <textarea
          ref={props.promptRef}
          className="pm-bar-ta"
          aria-label={editing ? "修改描述" : "画面描述"}
          maxLength={32000}
          value={f.prompt}
          placeholder={
            hasSketch
              ? `根据图${sketchIdx + 1}的草图描述你想要的画面，例如材质、光线和风格。`
              : editing
                ? "例如：保留图1的商品，使用图2的背景"
                : "描述你想要的画面，比如：雪夜的山顶小屋，一盏暖灯"
          }
          disabled={props.generating || props.reading}
          rows={1}
          onChange={(e) => onPatch({ prompt: e.target.value })}
        />
        <button
          type="button"
          className={"pm-bar-send" + (ready ? " ready" : "")}
          aria-label={
            hasSketch ? "根据草图生成" : editing ? "生成编辑结果" : "生成图片"
          }
          disabled={!ready}
          onClick={props.onGenerate}
        >
          <ArrowUp size={16} strokeWidth={2.4} />
        </button>
      </div>
      <div className="pm-bar-row2">
        {props.canReturn && (
          <button
            type="button"
            className="pm-chip pm-chip-return"
            onClick={props.onReturn}
          >
            <RotateCcw size={11} />
            返回结果
          </button>
        )}
        <BarChip
          ariaLabel="添加输入"
          icon={<Plus size={13} />}
          disabled={props.generating || props.reading}
          popWidth={252}
          closeOnSelect
        >
          <button
            type="button"
            className="pm-pop-opt with-ic"
            disabled={atMax}
            onClick={() => fileRef.current?.click()}
          >
            <span className="ic">
              <Paperclip size={14} />
            </span>
            <span className="tx">
              <span className="nm">上传图片</span>
              <span className="ds">PNG / JPEG / WebP · 连草图最多 16 张</span>
            </span>
          </button>
          <button
            type="button"
            className="pm-pop-opt with-ic"
            disabled={!hasSketch && atMax}
            onClick={props.onOpenSketch}
          >
            <span className="ic">
              <Pencil size={14} />
            </span>
            <span className="tx">
              <span className="nm">{hasSketch ? "继续画草图" : "画草图"}</span>
              <span className="ds">
                {hasSketch
                  ? "打开已确认的草图继续修改"
                  : atMax
                    ? "已达 16 张输入上限"
                    : "画构图、轮廓与色块，确认后作为输入"}
              </span>
            </span>
          </button>
        </BarChip>

        <BarChip
          ariaLabel="模型"
          value={MODEL_LABELS[f.model]}
          suffix={f.model === "flare" ? "快速" : "精细"}
          dirty={f.model !== DEFAULT_FORM.model}
          disabled={props.generating}
          closeOnSelect
        >
          <PopRow
            selected={f.model === "flare"}
            name="Flare · 快速"
            desc="约 10s 出图，日常迭代首选"
            onClick={() => onPatch({ model: "flare" })}
          />
          <PopRow
            selected={f.model === "sunburst"}
            name="Sunburst · 精细"
            desc="细节与文字渲染更强，速度较慢"
            onClick={() => onPatch({ model: "sunburst" })}
          />
        </BarChip>

        <BarChip
          ariaLabel="比例与基准"
          value={
            usingCustom
              ? `${f.cw}×${f.ch}`
              : f.ratio === "auto"
                ? "自动"
                : `${f.ratio} · ${BASE_LABELS.find((b) => b.id === f.base)?.label}`
          }
          dirty={
            f.ratio !== DEFAULT_FORM.ratio ||
            f.base !== DEFAULT_FORM.base ||
            usingCustom
          }
          disabled={props.generating}
          popWidth={252}
        >
          <p className="pm-pop-lb">比例</p>
          <div className="pm-pop-ratio">
            {RATIO_CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={!usingCustom && f.ratio === c.id ? "on" : ""}
                onClick={() => onPatch({ ratio: c.id, cw: "", ch: "" })}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="pm-pop-lb">基准分辨率</p>
          <Segmented
            full
            ariaLabel="基准分辨率"
            value={f.base}
            disabled={f.ratio === "auto" || usingCustom}
            onChange={(base) => onPatch({ base })}
            options={BASE_LABELS.map((b) => ({ value: b.id, label: b.label }))}
          />
          <p className="pm-pop-lb">自定义</p>
          <div className="pm-pop-wh">
            <input
              type="number"
              min={256}
              max={3840}
              step={16}
              placeholder="宽"
              aria-label="自定义宽度"
              value={f.cw}
              className={props.customValid ? "" : "bad"}
              onChange={(e) => onPatch({ cw: e.target.value })}
            />
            <span>×</span>
            <input
              type="number"
              min={256}
              max={3840}
              step={16}
              placeholder="高"
              aria-label="自定义高度"
              value={f.ch}
              className={props.customValid ? "" : "bad"}
              onChange={(e) => onPatch({ ch: e.target.value })}
            />
            <span>px</span>
          </div>
          <p className="pm-pop-hint">
            宽高须被 16 整除 · 比例 1:3 ～ 3:1 · ≤ 3840 × 2160
          </p>
          <p className="pm-pop-hint">
            画草图的画布尺寸 = 当前输出尺寸；「自动」时为 1024 × 1024
          </p>
          {sizeMismatch && (
            <p className="pm-pop-hint warn" role="status">
              输出比例与草图不同，构图可能调整
            </p>
          )}
        </BarChip>

        <BarChip
          ariaLabel="质量"
          value={QUALITY_LABELS[f.quality]}
          suffix="质量"
          dirty={f.quality !== DEFAULT_FORM.quality}
          disabled={props.generating}
          closeOnSelect
        >
          {(
            [
              ["low", "低", "最快，草图沟通用"],
              ["medium", "中", "快，细节略简"],
              ["high", "高", "默认，速度与细节平衡"],
              ["xhigh", "超高", "细节明显提升，更慢"],
              ["max", "最高", "交付级，耗时最长"],
            ] as Array<[Quality, string, string]>
          ).map(([id, name, desc]) => (
            <PopRow
              key={id}
              selected={f.quality === id}
              name={name}
              desc={desc}
              onClick={() => onPatch({ quality: id })}
            />
          ))}
        </BarChip>

        <BarChip
          ariaLabel="生成张数"
          value={`×${f.n}`}
          dirty={f.n !== DEFAULT_FORM.n}
          disabled={props.generating}
          popWidth={196}
          closeOnSelect
        >
          <div className="pm-pop-n">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                className={f.n === n ? "on" : ""}
                onClick={() => onPatch({ n })}
              >
                ×{n}
              </button>
            ))}
          </div>
          <p className="pm-pop-hint">
            一次请求生成，逐张入库；n&gt;1 时舞台以 2×2 网格展示
          </p>
        </BarChip>

        <BarChip
          ariaLabel="更多设置"
          icon={<span className="pm-chip-icon-txt">⋯</span>}
          disabled={props.generating}
          right
          popWidth={252}
        >
          <p className="pm-pop-lb">背景</p>
          <Segmented
            full
            ariaLabel="背景"
            value={f.bg}
            onChange={(bg) =>
              onPatch(
                bg === "transparent" && f.fmt === "jpeg"
                  ? ({ bg, fmt: "png" } as Partial<GenForm>)
                  : { bg },
              )
            }
            options={[
              { value: "auto", label: "自动" },
              { value: "transparent", label: "透明" },
              { value: "opaque", label: "纯色" },
            ]}
          />
          <p className="pm-pop-lb">输出格式</p>
          <Segmented
            full
            ariaLabel="输出格式"
            value={f.fmt}
            onChange={(fmt) => onPatch({ fmt })}
            options={
              f.bg === "transparent"
                ? ([
                    { value: "png", label: "PNG" },
                    { value: "webp", label: "WebP" },
                  ] as Array<{ value: OutputFormat; label: string }>)
                : ([
                    { value: "png", label: "PNG" },
                    { value: "jpeg", label: "JPEG" },
                    { value: "webp", label: "WebP" },
                  ] as Array<{ value: OutputFormat; label: string }>)
            }
          />
          {editing && (
            <>
              <p className="pm-pop-lb">保留原图</p>
              <Segmented<FidelityChoice>
                full
                ariaLabel="保留原图"
                value={props.inputFidelity}
                onChange={props.onInputFidelity}
                options={[
                  { value: "auto", label: "自动" },
                  { value: "low", label: "低" },
                  { value: "high", label: "高" },
                ]}
              />
              <p className="pm-pop-hint">
                自动不发送保真度参数，按服务端默认；部分中转站不支持显式低 /
                高。
              </p>
              {hasSketch && (
                <p className="pm-pop-hint">
                  草图仅作构图参考——「保留原图 · 高」不会精确还原手绘线条。
                </p>
              )}
            </>
          )}
        </BarChip>
      </div>
    </div>
  );
}

/** ── generating 态 ── */
function GenBar(props: {
  model: ModelId;
  partialIndex: number;
  saving: boolean;
  onCancel: () => void;
}) {
  const step = Math.min(3, props.partialIndex + 1);
  return (
    <div className="pm-bar-gen" role="status">
      <div className="pm-bar-genrow">
        <span className="pm-bar-genmodel">{MODEL_LABELS[props.model]}</span>
        <span className="pm-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="pm-bar-genst">
          {props.saving ? (
            <>生成完成，正在保存到本地…</>
          ) : (
            <>
              正在生成 · 渐进预览 <b>{step}/3</b>
            </>
          )}
        </span>
        {!props.saving && (
          <button
            type="button"
            className="pm-bar-cancel"
            onClick={props.onCancel}
          >
            ✕ 取消
          </button>
        )}
      </div>
      <div className="pm-shimmer" aria-hidden />
      <p className="pm-bar-gennote">
        单次流式请求 · partial_images 3 · 完成后自动保存到本地
      </p>
    </div>
  );
}

/** ── complete 态 ── */
function DoneBar(props: {
  done: DisplayGen;
  onAgain: () => void;
  onTweak: () => void;
  onDownloadAll: () => void;
  onUseAsRef: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="pm-bar-done">
      <div className="pm-bar-genrow">
        <span className="pm-bar-ok">
          <i aria-hidden />
          生成完成 · 已保存本地
        </span>
        <span className="pm-bar-dur">
          耗时 <b>{fmtDuration(props.done.row.durationMs)}</b>
        </span>
        <button
          type="button"
          className="pm-bar-dismiss"
          aria-label="收起，回到输入"
          onClick={props.onDismiss}
        >
          ✕
        </button>
      </div>
      <div className="pm-bar-donerow">
        <span className="pm-bar-donecap">接下来</span>
        <button
          type="button"
          className="pm-chip act primary"
          onClick={props.onAgain}
        >
          再来一版
        </button>
        <button type="button" className="pm-chip act" onClick={props.onTweak}>
          微调描述
        </button>
        <button
          type="button"
          className="pm-chip act"
          onClick={props.onDownloadAll}
        >
          下载全部
        </button>
        <button
          type="button"
          className="pm-chip act"
          onClick={props.onUseAsRef}
        >
          <Sparkles size={11} />
          设为参考图
        </button>
      </div>
    </div>
  );
}

/** 底栏总装：状态优先级 generating > complete > (full > mini) */
export function CreateBar(props: {
  mode: "mini" | "full";
  generating: boolean;
  saving: boolean;
  done: DisplayGen | null;
  partialIndex: number;
  form: GenForm;
  customValid: boolean;
  images: DisplayInput[];
  inputFidelity: FidelityChoice;
  reading: boolean;
  uploadError: string;
  canReturn: boolean;
  sketchSize: { w: number; h: number } | null;
  promptRef: RefObject<HTMLTextAreaElement | null>;
  onPatch: (patch: Partial<GenForm>) => void;
  onGenerate: () => void;
  onCancel: () => void;
  onFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  onPreview: (id: string) => void;
  onOpenSketch: () => void;
  onEditSketch: (id: string) => void;
  onInputFidelity: (value: FidelityChoice) => void;
  onExpand: () => void;
  onReturn: () => void;
  onAgain: () => void;
  onTweak: () => void;
  onDownloadAll: () => void;
  onUseAsRef: () => void;
  onDismissDone: () => void;
}) {
  const state = props.generating
    ? "generating"
    : props.done
      ? "complete"
      : props.mode;
  return (
    <section
      className="pm-island pm-bar"
      aria-label="创作条"
      data-state={state}
    >
      {state === "mini" && (
        <MiniBar
          form={props.form}
          disabled={props.reading}
          onExpand={props.onExpand}
        />
      )}
      {state === "full" && (
        <FullBar
          form={props.form}
          customValid={props.customValid}
          images={props.images}
          inputFidelity={props.inputFidelity}
          reading={props.reading}
          uploadError={props.uploadError}
          generating={false}
          canReturn={props.canReturn}
          sketchSize={props.sketchSize}
          promptRef={props.promptRef}
          onPatch={props.onPatch}
          onGenerate={props.onGenerate}
          onFiles={props.onFiles}
          onRemove={props.onRemove}
          onPreview={props.onPreview}
          onOpenSketch={props.onOpenSketch}
          onEditSketch={props.onEditSketch}
          onInputFidelity={props.onInputFidelity}
          onReturn={props.onReturn}
        />
      )}
      {state === "generating" && (
        <GenBar
          model={props.form.model}
          partialIndex={props.partialIndex}
          saving={props.saving}
          onCancel={props.onCancel}
        />
      )}
      {state === "complete" && props.done && (
        <DoneBar
          done={props.done}
          onAgain={props.onAgain}
          onTweak={props.onTweak}
          onDownloadAll={props.onDownloadAll}
          onUseAsRef={props.onUseAsRef}
          onDismiss={props.onDismissDone}
        />
      )}
    </section>
  );
}
