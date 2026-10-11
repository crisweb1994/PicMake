/** 底部创作条：mini / full / generating / complete 四态，纯展示；弹层开合为内部状态 */
import { useRef, type RefObject } from "react";
import { ArrowUp, Paperclip, Pencil, Plus, RotateCcw } from "lucide-react";
import { type GenForm } from "../../lib/params";
import type {
  DisplayGen,
  DisplayInput,
  InpaintBarInfo,
} from "../../lib/view-models";
import type { FidelityChoice } from "../../lib/types";
import { MAX_INPUT_IMAGES } from "../../lib/types";
import { BarChip } from "./BarChip";

import { InputThumbs } from "./InputThumbs";
import { MiniBar } from "./MiniBar";
import { GenBar } from "./GenBar";
import { DoneBar } from "./DoneBar";
import { ParamChips } from "./ParamChips";

/** ── full 态：附件 + 输入 + 参数 chips ── */
interface FullBarProps {
  form: GenForm;
  customValid: boolean;
  images: DisplayInput[];
  inputFidelity: FidelityChoice;
  reading: boolean;
  uploadError: string;
  canReturn: boolean;
  /** 已确认草图的逻辑尺寸；无草图为 null */
  sketchSize: { w: number; h: number } | null;
  /** 局部重绘投影；无选区为 null */
  inpaint: InpaintBarInfo | null;
  promptRef: RefObject<HTMLTextAreaElement | null>;
  onPatch: (patch: Partial<GenForm>) => void;
  onGenerate: () => void;
  onFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  onPreview: (id: string) => void;
  /** 打开新画板 */
  onOpenSketch: () => void;
  /** 点击草图缩略图重新打开画板 */
  onEditSketch: (id: string) => void;
  onInputFidelity: (value: FidelityChoice) => void;
  onReturn: () => void;
  /** 发起局部重绘（普通图片 ✎） */
  onStartInpaint: (id: string) => void;
  /** 修改已确认选区（底图 ✎） */
  onEditMask: () => void;
  /** 移除选区：保留底图与描述，切换为普通图片编辑 */
  onRemoveMask: () => void;
  /** 接受建议输出尺寸 */
  onAcceptSize: () => void;
}

function FullBar(props: FullBarProps) {
  const { form: f, onPatch } = props;
  const fileRef = useRef<HTMLInputElement>(null);
  const editing = props.images.length > 0;
  const sketchIdx = props.images.findIndex((image) => image.isSketch);
  const hasSketch = sketchIdx >= 0;
  const atMax = props.images.length >= MAX_INPUT_IMAGES;
  const inpaint = props.inpaint;
  const sizeBlocked = !!inpaint?.suggested && !inpaint.accepted;
  const ready = !props.reading && !sizeBlocked && f.prompt.trim().length > 0;
  return (
    <div className="pm-bar-full">
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        hidden
        disabled={props.reading}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) props.onFiles(files);
        }}
      />
      {editing && (
        <InputThumbs
          images={props.images}
          reading={props.reading}
          inpaint={inpaint}
          onRemove={props.onRemove}
          onPreview={props.onPreview}
          onEditSketch={props.onEditSketch}
          onStartInpaint={props.onStartInpaint}
          onEditMask={props.onEditMask}
          onRemoveMask={props.onRemoveMask}
        />
      )}
      {inpaint?.suggested && (
        <div className="pm-bar-size" role="status">
          <span>输出尺寸与原图不同</span>
          <b>
            {inpaint.tw} × {inpaint.th}
          </b>
          <span className="why">{inpaint.reason}</span>
          {inpaint.accepted ? (
            <span className="ok">已接受</span>
          ) : (
            <button type="button" onClick={props.onAcceptSize}>
              接受并使用
            </button>
          )}
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
          aria-label={inpaint ? "修改描述" : editing ? "修改描述" : "画面描述"}
          maxLength={32000}
          value={f.prompt}
          placeholder={
            inpaint
              ? "描述选中区域要怎么改，例如：把杯子换成白色陶瓷杯"
              : hasSketch
                ? `根据图${sketchIdx + 1}的草图描述你想要的画面，例如材质、光线和风格。`
                : editing
                  ? "例如：保留图1的商品，使用图2的背景"
                  : "描述你想要的画面，比如：雪夜的山顶小屋，一盏暖灯"
          }
          disabled={props.reading}
          rows={1}
          onChange={(e) => onPatch({ prompt: e.target.value })}
        />
        <button
          type="button"
          className={"pm-bar-send" + (ready ? " ready" : "")}
          aria-label={
            inpaint
              ? "生成重绘结果"
              : hasSketch
                ? "根据草图生成"
                : editing
                  ? "生成编辑结果"
                  : "生成图片"
          }
          title={sizeBlocked ? "请先接受建议输出尺寸" : undefined}
          disabled={!ready}
          onClick={props.onGenerate}
        >
          <ArrowUp size={16} strokeWidth={2.4} />
        </button>
      </div>
      {inpaint && (
        <p className="pm-bar-inp-note">
          选区用于引导修改，结果中的其他区域也可能发生变化 ·
          未提交的选区仅保留在当前页面
        </p>
      )}
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
          disabled={props.reading}
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
        <ParamChips
          form={f}
          customValid={props.customValid}
          sketchSize={props.sketchSize}
          editing={editing}
          hasSketch={hasSketch}
          inputFidelity={props.inputFidelity}
          onPatch={onPatch}
          onInputFidelity={props.onInputFidelity}
        />
      </div>
    </div>
  );
}

/** 底栏总装：状态优先级 generating > complete > (full > mini)；FullBar 子集整体透传 */
export function CreateBar(
  props: FullBarProps & {
    mode: "mini" | "full";
    generating: boolean;
    done: DisplayGen | null;
    partialIndex: number;
    onCancel: () => void;
    onExpand: () => void;
    onAgain: () => void;
    onTweak: () => void;
    onDownloadAll: () => void;
    onUseAsRef: () => void;
  },
) {
  const {
    mode,
    generating,
    done,
    partialIndex,
    onCancel,
    onExpand,
    onAgain,
    onTweak,
    onDownloadAll,
    onUseAsRef,
    ...full
  } = props;
  const state = generating ? "generating" : done ? "complete" : mode;
  return (
    <section
      className="pm-island pm-bar"
      aria-label="创作条"
      data-state={state}
    >
      {state === "mini" && (
        <MiniBar form={full.form} disabled={full.reading} onExpand={onExpand} />
      )}
      {state === "full" && <FullBar {...full} />}
      {state === "generating" && (
        <GenBar
          model={full.form.model}
          partialIndex={partialIndex}
          onCancel={onCancel}
        />
      )}
      {state === "complete" && done && (
        <DoneBar
          done={done}
          onAgain={onAgain}
          onTweak={onTweak}
          onDownloadAll={onDownloadAll}
          onUseAsRef={onUseAsRef}
          onDismiss={onExpand}
        />
      )}
    </section>
  );
}
