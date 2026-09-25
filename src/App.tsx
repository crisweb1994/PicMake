/** 应用接线层：组合业务流程与查看状态，投影成各业务组件 props。
 *  布局（PRD §5.1，2026-09-23）：全幅舞台 + 底部 CreateBar + 舞台右上 DetailCard。 */
import { useEffect, useMemo, useRef, useState } from "react";
import { TopNav } from "./components/TopNav";
import { Stage } from "./components/Stage";
import { CreateBar } from "./components/bar/CreateBar";
import { DetailCard } from "./components/DetailCard";
import { SketchModal } from "./components/SketchModal";
import {
  InputPreview,
  Carousel,
  ConfirmDialog,
  HistoryDrawer,
  Lightbox,
  SettingsModal,
} from "./components/Overlays";
import { useHistory } from "./hooks/useHistory";
import { useForm } from "./hooks/useForm";
import { usePicmake } from "./hooks/usePicmake";
import { useSketch } from "./hooks/useSketch";
import { useViewUi } from "./hooks/useViewUi";
import { db } from "./db/schema";
import { fmtBytes } from "./lib/format";
import { formSize } from "./lib/params";
import { SKETCH_DEFAULT_SIZE, ratioMismatch } from "./lib/sketch";
import { ERROR_HINTS, MAX_INPUT_IMAGES } from "./lib/types";
import { useSettingsModal } from "./hooks/useSettings";
import { useTheme } from "./hooks/useTheme";
import { toast } from "@heroui/react";

function downloadUrl(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function App() {
  const {
    settingsOpen,
    saveSettings,
    openSettings,
    closeSettings,
    runTestConnection,
  } = useSettingsModal();
  const view = useViewUi();
  const form = useForm();
  const history = useHistory();
  const theme = useTheme();
  const [previewId, setPreviewId] = useState<string | null>(null);
  /** 底栏 UI 状态（PRD §5.2）：mini 收起 / full 展开；generating、complete 由流程态覆盖 */
  const [barMode, setBarMode] = useState<"mini" | "full">("mini");
  const pm = usePicmake({
    history,
    form,
    onViewReset: () => {
      view.clearViewingState();
      setPreviewId(null);
    },
    onDraftReady: () => {
      setBarMode("full");
      form.focus();
    },
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  /** 详情浮卡的手动收起按记录 id 记忆：换记录后自动重新出现 */
  const [detailClosedFor, setDetailClosedFor] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  /* ── 草图画板（SKETCH §6/§8）：画板只产出附件，确认落回创作条，不发请求 ── */
  const sketch = useSketch({
    onApply: ({ image, replaces }) => {
      const wasEmpty = !replaces && form.inputs.length === 0;
      const sizeBefore = formSize(form.form);
      const promptEmpty = !form.form.prompt.trim();
      if (!form.applySketch(image, replaces)) return false;
      // §6.4 草图首次成为唯一输入且输出为 auto：确认时显式设置为草图尺寸
      if (wasEmpty && sizeBefore === "auto") {
        form.patchForm({ cw: String(image.width), ch: String(image.height) });
        toast(`输出尺寸已设为草图尺寸 ${image.width} × ${image.height}`);
      }
      // §6.3 首次添加草图且描述为空：填入可见可编辑的起始文字（不覆盖已有文字）
      if (!replaces && promptEmpty) {
        form.patchForm({
          prompt: `以图${form.inputs.length + 1}的草图为构图参考，保留主体的相对位置与比例，将粗略线条转成完整画面。`,
        });
      }
      setBarMode("full");
      form.focus();
      return true;
    },
  });
  /** 已确认草图的逻辑尺寸（比例不一致提示） */
  const sketchInput = form.inputs.find((input) => input.upload?.sketch);
  const sketchSize = useMemo(
    () =>
      sketchInput?.upload
        ? { w: sketchInput.upload.width, h: sketchInput.upload.height }
        : null,
    [sketchInput],
  );

  const canOpenSketch = () =>
    pm.phase !== "generating" &&
    !pm.saving &&
    !form.reading &&
    !history.pendingSave &&
    !pm.confirmState &&
    !sketch.session;

  /** 菜单「画草图 / 继续画草图」：新画布 = 当前输出尺寸，auto 时 1024×1024（§6.4） */
  const openSketchNew = () => {
    if (!canOpenSketch()) return;
    if (
      !form.images.some((image) => image.isSketch) &&
      form.inputs.length >= MAX_INPUT_IMAGES
    ) {
      toast(ERROR_HINTS["too-many-images"]);
      return;
    }
    const size = formSize(form.form);
    sketch.openNew(
      ...(size === "auto"
        ? ([SKETCH_DEFAULT_SIZE, SKETCH_DEFAULT_SIZE] as const)
        : ([size.w, size.h] as const)),
    );
  };

  const editAttachmentSketch = (imageId: string) => {
    if (!canOpenSketch()) return;
    const idx = form.inputs.findIndex((input) => input.imageId === imageId);
    const doc = form.inputs[idx]?.upload?.sketch;
    if (!doc) return;
    sketch.openEdit(doc, imageId, idx);
  };

  /** 历史来源草图：以新草稿打开画板，确认产生新 imageId，不改旧记录（§8.2） */
  const continueHistorySketch = (imageId: string) => {
    if (!canOpenSketch()) return;
    setPreviewId(null);
    void db.images.get(imageId).then((row) => {
      if (!row) {
        toast("来源图片不可用，无法继续编辑这张草图");
        return;
      }
      sketch.openHistory(row.sketch);
    });
  };

  const requestCloseSketch = () => {
    if (sketch.confirming) return;
    if (sketch.changed) {
      pm.setConfirmState({
        title: "放弃本次草图修改？",
        desc: "未确认的笔画不会保存；已确认的草图附件保持不变。",
        okLabel: "放弃修改",
        cancelLabel: "继续画",
        onOk: sketch.close,
      });
      return;
    }
    sketch.close();
  };

  // 比例不一致 toast（§6.4）：仅在进入不一致状态时提示一次，就地提示见尺寸弹层
  const mismatchRef = useRef(false);
  useEffect(() => {
    const size = formSize(form.form);
    const mismatch =
      !!sketchSize && size !== "auto" && ratioMismatch(size, sketchSize);
    if (mismatch && !mismatchRef.current)
      toast("输出比例与草图不同，构图可能调整");
    mismatchRef.current = mismatch;
  }, [form.form, sketchSize]);

  const [usageText, setUsageText] = useState("");
  useEffect(() => {
    void navigator.storage?.estimate?.().then((est) => {
      if (est?.usage != null) setUsageText(` · 已用 ${fmtBytes(est.usage)}`);
    });
  }, [history.rows.length]);

  const downloadOne = (idx: number) => {
    if (!history.display) return;
    const im = history.display.images[idx];
    const ext =
      history.display.row.params.outputFormat === "jpeg"
        ? "jpg"
        : history.display.row.params.outputFormat;
    downloadUrl(im.url, `PicMake-${history.display.row.id.slice(0, 8)}.${ext}`);
  };
  const downloadAll = () =>
    history.display?.images.forEach((_, i) => downloadOne(i));

  const selectedImageId = history.display
    ? history.display.images.length === 1
      ? history.display.images[0].id
      : view.focusIdx !== null
        ? (history.display.images[view.focusIdx]?.id ?? null)
        : null
    : null;
  const editSelected = () => {
    if (selectedImageId) pm.editImage(selectedImageId);
  };
  const totalImages = history.rows.reduce((s, r) => s + r.imageIds.length, 0);

  /** complete 态只在展示的确实是刚保存的那次生成时成立 */
  const doneGen =
    pm.lastDone && history.display?.row.id === pm.lastDone.id
      ? history.display
      : null;

  const expandBar = () => {
    pm.clearDone();
    setBarMode("full");
    form.focus();
  };

  // full 态点条外收起：仅在无草稿（未改过任何字段、无输入图、无编辑来源）时；
  // 画板打开期间点击落在浮层上，不收回（SK13 同源阻断）
  useEffect(() => {
    if (barMode !== "full") return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        !t ||
        t.closest(".pm-bar") ||
        t.closest(".pm-detail") ||
        t.closest(".modal__backdrop") ||
        t.closest(".pm-sk-overlay")
      )
        return;
      if (!form.dirty && !form.images.length && !pm.canReturn)
        setBarMode("mini");
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [barMode, form.dirty, form.images.length, pm.canReturn, sketch.session]);

  // 详情浮卡可见性：展示记录存在、非生成中、且未被用户收起（按记录 id 记忆）
  const detailVisible =
    !!history.display &&
    pm.phase === "idle" &&
    detailClosedFor !== history.display.row.id;

  // 舞台滚轮切换历史（PRD FR-6，2026-09-23）：仅无草稿、无未保存结果、无弹层且非生成中时响应；
  // 有任何阻断条件时不挂监听（滚轮落到默认行为），避免误触丢草稿。
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const blocked =
      pm.phase === "generating" ||
      pm.saving ||
      !!pm.confirmState ||
      !!history.pendingSave ||
      form.dirty ||
      form.inputs.length > 0 ||
      settingsOpen ||
      drawerOpen ||
      !!view.lightbox ||
      !!sketch.session ||
      view.focusIdx !== null;
    if (blocked) return;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.defaultPrevented) return;
      e.preventDefault();
      const now = performance.now();
      if (now - last < 300 || Math.abs(e.deltaY) < 16) return;
      last = now;
      const rows = history.rows;
      if (!rows.length) return;
      const idx = rows.findIndex((r) => r.id === history.selectedId);
      const next =
        idx === -1
          ? 0
          : e.deltaY > 0
            ? Math.min(rows.length - 1, idx + 1)
            : Math.max(0, idx - 1);
      if (next === idx) return;
      void pm.selectHistory(rows[next]);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const useAsReference = () => {
    if (!history.display) return;
    const imageId = selectedImageId ?? history.display.images[0]?.id ?? null;
    if (!imageId) return;
    const idx = history.display.row.imageIds.indexOf(imageId);
    form.appendExisting(
      imageId,
      history.display.row.id,
      `已有作品 · 第 ${idx + 1} 张`,
    );
    pm.clearDone();
    setBarMode("full");
    toast("已加入参考图，继续描述后生成");
  };

  return (
    <>
      <div className="pm-stage-col" ref={stageRef}>
        <Stage
          phase={pm.phase}
          partial={pm.partial}
          genPlan={pm.plan}
          display={history.display}
          onFocus={view.setFocusIdx}
          onLightbox={(id) =>
            view.setLightbox(
              history.display?.images.find((image) => image.id === id) ?? null,
            )
          }
          onDownload={downloadOne}
          onDownloadAll={downloadAll}
          onReuse={() => history.display && pm.reuseParams(history.display.row)}
          onEdit={history.pendingSave ? undefined : editSelected}
          onDelete={() => history.display && pm.deleteGen(history.display.row)}
          onCancel={pm.cancelGenerate}
          onStart={expandBar}
        />
      </div>

      <TopNav
        theme={theme.resolved}
        onToggleTheme={theme.toggle}
        onHistory={() => setDrawerOpen(true)}
        onSettings={openSettings}
      />

      {history.display && detailVisible && (
        <DetailCard
          display={history.display}
          selectedImageId={selectedImageId}
          canEdit={!history.pendingSave && !pm.saving}
          sources={history.sourceImages}
          starred={!!history.display.row.starred}
          onViewSource={setPreviewId}
          onDownload={() => downloadOne(view.focusIdx ?? 0)}
          onCopyPrompt={() => {
            if (history.display)
              void navigator.clipboard
                ?.writeText(history.display.row.prompt)
                .then(() => toast("画面描述已复制"));
          }}
          onReuse={() => history.display && pm.reuseParams(history.display.row)}
          onEdit={pm.editImage}
          onDelete={() => history.display && pm.deleteGen(history.display.row)}
          onToggleStar={() => {
            if (history.display)
              void history.toggleStar(history.display.row.id);
          }}
          onNew={pm.newGeneration}
          onClose={() =>
            history.display && setDetailClosedFor(history.display.row.id)
          }
        />
      )}

      <CreateBar
        mode={barMode}
        generating={pm.phase === "generating"}
        saving={pm.saving}
        done={doneGen}
        partialIndex={pm.partial?.index ?? 0}
        form={form.form}
        customValid={form.customValid}
        images={form.images}
        inputFidelity={form.inputFidelity}
        reading={form.reading}
        uploadError={form.uploadError}
        canReturn={pm.canReturn}
        sketchSize={sketchSize}
        promptRef={form.promptRef}
        onPatch={form.patchForm}
        onGenerate={pm.generate}
        onCancel={pm.cancelGenerate}
        onFiles={(files) => {
          void form.addFiles(files);
        }}
        onRemove={(id) => form.removeInput(id)}
        onPreview={setPreviewId}
        onOpenSketch={openSketchNew}
        onEditSketch={editAttachmentSketch}
        onInputFidelity={form.setInputFidelity}
        onExpand={expandBar}
        onReturn={pm.returnToResult}
        onAgain={() => doneGen && pm.regenerate(doneGen.row)}
        onTweak={() => {
          if (doneGen) pm.reuseParams(doneGen.row);
        }}
        onDownloadAll={downloadAll}
        onUseAsRef={useAsReference}
        onDismissDone={() => {
          pm.clearDone();
          setBarMode("full");
          form.focus();
        }}
      />

      <HistoryDrawer
        open={drawerOpen}
        rows={history.rows}
        thumbnailUrls={history.thumbnailUrls}
        currentId={history.display?.row.id ?? null}
        onSelect={(id) => {
          const row = history.rows.find((row) => row.id === id);
          if (row) void pm.selectHistory(row);
          setDrawerOpen(false);
        }}
        onToggleStar={(id) => void history.toggleStar(id)}
        onClose={() => setDrawerOpen(false)}
      />

      <SettingsModal
        key={settingsOpen ? "settings-open" : "settings-closed"}
        open={settingsOpen}
        baseUrl={pm.settings.baseUrl}
        apiKey={pm.settings.apiKey}
        storageText={`本地已存 ${history.rows.length} 次 · ${totalImages} 张${usageText}`}
        theme={theme.pref}
        onThemeChange={theme.setPref}
        onTest={runTestConnection}
        onSave={saveSettings}
        onClose={closeSettings}
      />
      {history.display &&
        pm.phase === "idle" &&
        history.display.images.length > 1 &&
        view.focusIdx !== null && (
          <Carousel
            img={history.display.images[view.focusIdx]}
            prompt={history.display.row.prompt}
            index={view.focusIdx}
            total={history.display.images.length}
            onPrev={() => {
              const n = history.display!.images.length;
              view.setFocusIdx((view.focusIdx! - 1 + n) % n);
            }}
            onNext={() => {
              const n = history.display!.images.length;
              view.setFocusIdx((view.focusIdx! + 1) % n);
            }}
            onClose={() => view.setFocusIdx(null)}
            onZoom={() =>
              view.setLightbox(history.display!.images[view.focusIdx!])
            }
            onDownload={() => downloadOne(view.focusIdx!)}
            onReuse={() => pm.reuseParams(history.display!.row)}
            onEdit={history.pendingSave ? undefined : editSelected}
            onDelete={() => pm.deleteGen(history.display!.row)}
          />
        )}
      <ConfirmDialog
        state={pm.confirmState}
        onCancel={() => pm.setConfirmState(null)}
      />
      <Lightbox
        img={view.lightbox}
        prompt={history.display?.row.prompt ?? ""}
        onDownload={() =>
          view.lightbox && downloadUrl(view.lightbox.url, "PicMake.png")
        }
        onReuse={() => {
          view.setLightbox(null);
          if (history.display) pm.reuseParams(history.display.row);
        }}
        onClose={() => view.setLightbox(null)}
      />
      <InputPreview
        key={previewId ?? "closed"}
        image={
          (history.display ? history.sourceImages : form.images).find(
            (image) => image.id === previewId,
          ) ?? null
        }
        onContinueSketch={
          previewId &&
          (history.display ? history.sourceImages : form.images).some(
            (image) => image.id === previewId && image.isSketch,
          )
            ? () => continueHistorySketch(previewId)
            : undefined
        }
        onClose={() => setPreviewId(null)}
      />
      {sketch.session && (
        <SketchModal
          doc={sketch.session.doc}
          cursor={sketch.session.cursor}
          meta={sketch.session.meta}
          confirming={sketch.confirming}
          onStroke={sketch.stroke}
          onClear={sketch.clearAll}
          onUndo={sketch.undo}
          onRedo={sketch.redo}
          onConfirm={sketch.confirm}
          onRequestClose={requestCloseSketch}
          onLimit={(kind) =>
            toast(
              kind === "commands"
                ? "已达绘制上限（2000 步），请撤销或清空后再继续"
                : "已达采样点上限，本笔到此为止",
            )
          }
        />
      )}
      {pm.saving && (
        <p className="pm-saving" role="status">
          正在保存到本地…
        </p>
      )}
    </>
  );
}
