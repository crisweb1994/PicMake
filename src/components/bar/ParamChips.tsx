/** 参数 chips：模型、比例与基准、质量、张数、更多设置；各自带弹层，开合为内部状态 */
import { useTranslation } from "react-i18next";
import { ratioLabel, sizeChipValue } from "../../i18n/labels";
import {
  BASE_LABELS,
  DEFAULT_FORM,
  MODEL_LABELS,
  RATIOS,
  formSize,
  isCustomActive,
  type GenForm,
} from "../../lib/params";
import { SIZE_LIMITS } from "../../lib/size";
import { ratioMismatch } from "../../lib/sketch";
import type { FidelityChoice, OutputFormat, Quality } from "../../lib/types";
import { Segmented } from "../controls";
import { BarChip, PopRow } from "./BarChip";

const QUALITIES: ReadonlyArray<Quality> = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

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
  const { t } = useTranslation();
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
        ariaLabel={t("params.model")}
        value={MODEL_LABELS[f.model]}
        suffix={
          f.model === "flare"
            ? t("params.modelFast")
            : t("params.modelDetailed")
        }
        dirty={f.model !== DEFAULT_FORM.model}
        closeOnSelect
      >
        <PopRow
          selected={f.model === "flare"}
          name={t("params.modelFlare")}
          desc={t("params.modelFlareDesc")}
          onClick={() => onPatch({ model: "flare" })}
        />
        <PopRow
          selected={f.model === "sunburst"}
          name={t("params.modelSunburst")}
          desc={t("params.modelSunburstDesc")}
          onClick={() => onPatch({ model: "sunburst" })}
        />
      </BarChip>

      <BarChip
        ariaLabel={t("params.ratioAndBase")}
        value={sizeChipValue(f, t)}
        dirty={
          f.ratio !== DEFAULT_FORM.ratio ||
          f.base !== DEFAULT_FORM.base ||
          usingCustom
        }
        popWidth={252}
      >
        <p className="pm-pop-lb">{t("params.ratio")}</p>
        <div className="pm-pop-ratio">
          {RATIOS.map((id) => (
            <button
              key={id}
              type="button"
              className={!usingCustom && f.ratio === id ? "on" : ""}
              onClick={() => onPatch({ ratio: id, cw: "", ch: "" })}
            >
              {ratioLabel(id, t)}
            </button>
          ))}
        </div>
        <p className="pm-pop-lb">{t("params.baseRes")}</p>
        <Segmented
          full
          ariaLabel={t("params.baseRes")}
          value={f.base}
          disabled={f.ratio === "auto" || usingCustom}
          onChange={(base) => onPatch({ base })}
          options={BASE_LABELS.map((b) => ({ value: b.id, label: b.label }))}
        />
        <p className="pm-pop-lb">{t("params.custom")}</p>
        <div className="pm-pop-wh">
          <input
            type="number"
            min={256}
            max={3840}
            step={16}
            placeholder={t("params.widthPlaceholder")}
            aria-label={t("params.customWidth")}
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
            placeholder={t("params.heightPlaceholder")}
            aria-label={t("params.customHeight")}
            value={f.ch}
            className={props.customValid ? "" : "bad"}
            onChange={(e) => onPatch({ ch: e.target.value })}
          />
          <span>px</span>
        </div>
        <p className="pm-pop-hint">
          {t("params.sizeHint", {
            long: SIZE_LIMITS.long,
            short: SIZE_LIMITS.short,
          })}
        </p>
        <p className="pm-pop-hint">{t("params.sketchSizeHint")}</p>
        {sizeMismatch && (
          <p className="pm-pop-hint warn" role="status">
            {t("params.sketchMismatch")}
          </p>
        )}
      </BarChip>

      <BarChip
        ariaLabel={t("params.quality")}
        value={t(`params.qualityLevel.${f.quality}`)}
        suffix={t("params.quality")}
        dirty={f.quality !== DEFAULT_FORM.quality}
        closeOnSelect
      >
        {QUALITIES.map((id) => (
          <PopRow
            key={id}
            selected={f.quality === id}
            name={t(`params.qualityLevel.${id}`)}
            desc={t(`params.qualityDesc.${id}`)}
            onClick={() => onPatch({ quality: id })}
          />
        ))}
      </BarChip>

      <BarChip
        ariaLabel={t("params.count")}
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
        <p className="pm-pop-hint">{t("params.countHint")}</p>
      </BarChip>

      <BarChip
        ariaLabel={t("params.more")}
        icon={<span className="pm-chip-icon-txt">⋯</span>}
        right
        popWidth={252}
      >
        <p className="pm-pop-lb">{t("params.background")}</p>
        <Segmented
          full
          ariaLabel={t("params.background")}
          value={f.bg}
          onChange={(bg) =>
            onPatch(
              bg === "transparent" && f.fmt === "jpeg"
                ? ({ bg, fmt: "png" } as Partial<GenForm>)
                : { bg },
            )
          }
          options={[
            { value: "auto", label: t("params.backgroundLevel.auto") },
            {
              value: "transparent",
              label: t("params.backgroundLevel.transparent"),
            },
            { value: "opaque", label: t("params.backgroundLevel.opaque") },
          ]}
        />
        <p className="pm-pop-lb">{t("params.format")}</p>
        <Segmented
          full
          ariaLabel={t("params.format")}
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
            <p className="pm-pop-lb">{t("params.keepOriginal")}</p>
            <Segmented<FidelityChoice>
              full
              ariaLabel={t("params.keepOriginal")}
              value={props.inputFidelity}
              onChange={props.onInputFidelity}
              options={[
                { value: "auto", label: t("common.auto") },
                { value: "low", label: t("params.fidelityLow") },
                { value: "high", label: t("params.fidelityHigh") },
              ]}
            />
            <p className="pm-pop-hint">{t("params.fidelityHint")}</p>
            {hasSketch && (
              <p className="pm-pop-hint">{t("params.fidelitySketchHint")}</p>
            )}
          </>
        )}
      </BarChip>
    </>
  );
}
