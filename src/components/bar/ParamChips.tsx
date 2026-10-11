/** 参数 chips：模型、比例与基准、质量、张数、更多设置；各自带弹层，开合为内部状态 */
import {
  BASE_LABELS,
  DEFAULT_FORM,
  MODEL_LABELS,
  QUALITY_LABELS,
  RATIO_CHIPS,
  formSize,
  isCustomActive,
  sizeChipValue,
  type GenForm,
} from "../../lib/params";
import { ratioMismatch } from "../../lib/sketch";
import type { FidelityChoice, OutputFormat, Quality } from "../../lib/types";
import { Segmented } from "../controls";
import { BarChip, PopRow } from "./BarChip";

export function ParamChips(props: {
  form: GenForm;
  customValid: boolean;
  /** 已确认草图的逻辑尺寸；无草图为 null */
  sketchSize: { w: number; h: number } | null;
  /** 有输入图（编辑态）：「保留原图」才有意义 */
  editing: boolean;
  hasSketch: boolean;
  inputFidelity: FidelityChoice;
  onPatch: (patch: Partial<GenForm>) => void;
  onInputFidelity: (value: FidelityChoice) => void;
}) {
  const { form: f, editing, hasSketch, onPatch } = props;
  const usingCustom = isCustomActive(f);
  const explicitSize = formSize(f);
  const sizeMismatch =
    !!props.sketchSize &&
    explicitSize !== "auto" &&
    ratioMismatch(explicitSize, props.sketchSize);
  return (
    <>
      <BarChip
        ariaLabel="模型"
        value={MODEL_LABELS[f.model]}
        suffix={f.model === "flare" ? "快速" : "精细"}
        dirty={f.model !== DEFAULT_FORM.model}
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
        value={sizeChipValue(f)}
        dirty={
          f.ratio !== DEFAULT_FORM.ratio ||
          f.base !== DEFAULT_FORM.base ||
          usingCustom
        }
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
              自动不发送保真度参数，按服务端默认；部分中转站不支持显式低 / 高。
            </p>
            {hasSketch && (
              <p className="pm-pop-hint">
                草图仅作构图参考——「保留原图 · 高」不会精确还原手绘线条。
              </p>
            )}
          </>
        )}
      </BarChip>
    </>
  );
}
