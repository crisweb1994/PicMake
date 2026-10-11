/** 应用接线层：组合业务流程与查看状态，投影成各业务组件 props */
import { useEffect, useMemo, useRef, useState } from "react";
import { TopNav } from "./components/TopNav";
import { Stage } from "./components/Stage";
import { CreateBar } from "./components/bar/CreateBar";
import { DetailCard } from "./components/DetailCard";
import { SketchModal } from "./components/SketchModal";
import { InpaintModal, MaskViewModal } from "./components/InpaintModal";
import {
  InputPreview,
  Carousel,
  ConfirmDialog,
  HistoryDrawer,
  Lightbox,
  SettingsModal,
} from "./components/Overlays";
import { useWorkspaceAssets } from "./hooks/useWorkspaceAssets";
import { useDraftImages } from "./hooks/useDraftImages";
import {
  adjustFromViewMask,
  confirmInpaint,
  confirmSketch,
  continueHistorySketch,
  editMask,
  editSketchAttachment,
  openSketchNew,
  openViewMask,
  requestCloseInpaint,
  requestCloseSketch,
  startInpaintFromInput,
  startInpaintFromResult,
} from "./flows/drawing";
import { cancelGenerate, generate, regenerate } from "./flows/generate";
import {
  addAsReference,
  adjustInpaint,
  deleteRecord,
  editImage,
  newGeneration,
  returnToResult,
  reuseParams,
  selectHistory,
  toggleStar,
} from "./flows/navigation";
import { downloadName } from "./lib/download";
import { fmtBytes } from "./lib/format";
import { customOk } from "./lib/params";
import {
  canWheelSwitch,
  hasUserWork,
  inpaintBarInfo,
  shouldCollapseBar,
} from "./lib/workspace-rules";
import { useObjectUrl } from "./hooks/useObjectUrl";
import { addFiles, removeInput, removeMask } from "./flows/draft";
import { startHistorySync } from "./flows/history-sync";
import { saveSettings, testConnection } from "./flows/settings";
import { useSettings } from "./store/settings";
import { useWorkspace } from "./store/workspace";
import {
  selectCanReturn,
  selectSelectedImageId,
} from "./store/workspace/selectors";
import {
  acceptSize,
  clearDone,
  closeConfirm,
  closeDrawer,
  closeLightbox,
  closeSettings,
  closeViewMask,
  openBar,
  openDrawer,
  openLightbox,
  openSettings,
  patchForm,
  redoDrawing,
  setBarMode,
  setFocusIdx,
  setInputFidelity,
  setPreviewId,
  strokeDrawing,
  undoDrawing,
} from "./store/workspace/actions";
import { useTheme } from "./hooks/useTheme";
import { toast } from "@heroui/react";

function downloadUrl(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

/** 画板绘制上限提示（草图与选区共用文案） */
function onDrawLimit(kind: "commands" | "points") {
  toast(
    kind === "commands"
      ? "已达绘制上限（2000 步），请撤销或清空后再继续"
      : "已达采样点上限，本笔到此为止",
  );
}

export default function App() {
  const { rows, display, sourceImages, thumbnailUrls } = useWorkspaceAssets();
  const theme = useTheme();
  const baseUrl = useSettings((s) => s.baseUrl);
  const apiKey = useSettings((s) => s.apiKey);
  // 查看与弹层状态在 store：这里只读，修改走迁移函数
  const {
    barMode,
    focusSeq,
    focusIdx,
    lightboxId,
    previewId,
    drawerOpen,
    settingsOpen,
    viewMask,
  } = useWorkspace((s) => s.view);
  const confirm = useWorkspace((s) => s.confirm);
  const lastDoneId = useWorkspace((s) => s.nav.lastDoneId);
  // 草稿在 store：读取中 = readId 非空；附件缩略图与重绘尺寸在这里投影
  const draft = useWorkspace((s) => s.draft);
  const reading = draft.readId !== null;
  const draftImages = useDraftImages(draft.inputs, !!draft.inpaint);
  const inpaintInfo = useMemo(
    () => inpaintBarInfo(draft.inpaint, draft.sizeAccepted),
    [draft.inpaint, draft.sizeAccepted],
  );
  // 生成生命周期：只有 generating 显示生成态；saving、unsaved 时舞台展示内存里的结果
  const run = useWorkspace((s) => s.run);
  const gen = run.phase === "generating" ? run : null;
  const pending = run.phase === "saving" || run.phase === "unsaved";
  const partialUrl = useObjectUrl(gen?.partial?.blob);
  const canReturn = useWorkspace(selectCanReturn);
  const selectedImageId = useWorkspace(selectSelectedImageId);
  // 历史列表订阅：IndexedDB 变更回推到 store，卸载时退订
  useEffect(() => startHistorySync(), []);
  /** 详情浮卡的手动收起按记录 id 记忆：换记录后自动重新出现 */
  const [detailClosedFor, setDetailClosedFor] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const lightbox =
    display?.images.find((image) => image.id === lightboxId) ?? null;
  const viewMaskUrl = useObjectUrl(viewMask?.base.blob);
  // 画板在 store：草图与局部重绘共用一个槽位；重绘底图 URL 随会话生成与回收
  const drawing = useWorkspace((s) => s.drawing);
  const inpaintBaseUrl = useObjectUrl(
    drawing?.kind === "inpaint" ? drawing.base.blob : null,
  );

  // focusSeq 变化即聚焦描述框（展开创作条、草稿落位、描述为空时提交）
  const promptRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusSeq) requestAnimationFrame(() => promptRef.current?.focus());
  }, [focusSeq]);

  /** 已确认草图的逻辑尺寸（比例不一致提示） */
  const sketchInput = draft.inputs.find((input) => input.upload?.sketch);
  const sketchSize = sketchInput?.upload
    ? { w: sketchInput.upload.width, h: sketchInput.upload.height }
    : null;

  const [usageText, setUsageText] = useState("");
  useEffect(() => {
    void navigator.storage?.estimate?.().then((est) => {
      if (est?.usage != null) setUsageText(` · 已用 ${fmtBytes(est.usage)}`);
    });
  }, [rows.length]);

  const downloadOne = (idx: number) => {
    if (!display) return;
    const im = display.images[idx];
    downloadUrl(im.url, downloadName(display.row.id, idx, im.format));
  };
  const downloadAll = () => display?.images.forEach((_, i) => downloadOne(i));

  const editSelected = () => {
    if (selectedImageId) editImage(selectedImageId);
  };
  const totalImages = rows.reduce((s, r) => s + r.imageIds.length, 0);

  /** complete 态只在展示的确实是刚保存的那次生成时成立 */
  const doneGen = lastDoneId && display?.row.id === lastDoneId ? display : null;

  const expandBar = () => {
    clearDone();
    openBar();
  };

  // full 态点条外收起：规则见 shouldCollapseBar；点击落在浮层上不收回
  useEffect(() => {
    if (barMode !== "full") return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        !t ||
        t.closest(".pm-bar") ||
        t.closest(".pm-detail") ||
        t.closest(".modal__backdrop") ||
        t.closest(".pm-sk-overlay") ||
        t.closest(".pm-ip-overlay") ||
        t.closest(".pm-vm-backdrop")
      )
        return;
      if (
        shouldCollapseBar({
          userWork: hasUserWork({ dirty: draft.dirty, reading }),
          inputCount: draft.inputs.length,
          canReturn,
        })
      )
        setBarMode("mini");
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [barMode, draft.dirty, reading, draft.inputs.length, canReturn]);

  // 详情浮卡可见性：展示记录存在、非生成中、且未被用户收起（按记录 id 记忆）
  const detailVisible = !!display && !gen && detailClosedFor !== display.row.id;

  // 舞台滚轮切换历史：规则见 canWheelSwitch，不满足时不挂监听
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const enabled = canWheelSwitch({
      run: run.phase,
      userWork: hasUserWork({ dirty: draft.dirty, reading }),
      inputCount: draft.inputs.length,
      overlayOpen:
        settingsOpen ||
        drawerOpen ||
        !!lightbox ||
        !!viewMask ||
        focusIdx !== null,
      drawing: drawing !== null,
      confirming: !!confirm,
    });
    if (!enabled) return;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.defaultPrevented) return;
      e.preventDefault();
      const now = performance.now();
      if (now - last < 300 || Math.abs(e.deltaY) < 16) return;
      last = now;
      if (!rows.length) return;
      const { selectedId } = useWorkspace.getState().nav;
      const idx = rows.findIndex((r) => r.id === selectedId);
      const next =
        idx === -1
          ? 0
          : e.deltaY > 0
            ? Math.min(rows.length - 1, idx + 1)
            : Math.max(0, idx - 1);
      if (next === idx) return;
      selectHistory(rows[next].id);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  return (
    <>
      <div className="pm-stage-col" ref={stageRef}>
        <Stage
          phase={gen ? "generating" : "idle"}
          partial={
            gen?.partial && partialUrl
              ? { url: partialUrl, index: gen.partial.index }
              : null
          }
          genPlan={gen?.plan ?? null}
          display={display}
          onFocus={setFocusIdx}
          onLightbox={openLightbox}
          onDownload={downloadOne}
          onDownloadAll={downloadAll}
          onReuse={() => display && reuseParams(display.row.id)}
          onEdit={pending ? undefined : editSelected}
          onDelete={() => display && deleteRecord(display.row.id)}
          onCancel={cancelGenerate}
          onStart={expandBar}
        />
      </div>

      <TopNav
        theme={theme.resolved}
        onToggleTheme={theme.toggle}
        onHistory={openDrawer}
        onSettings={openSettings}
      />

      {display && detailVisible && (
        <DetailCard
          display={display}
          selectedImageId={selectedImageId}
          canEdit={run.phase === "idle"}
          sources={sourceImages}
          onViewSource={setPreviewId}
          onDownload={() => downloadOne(focusIdx ?? 0)}
          onCopyPrompt={() => {
            if (display)
              void navigator.clipboard
                ?.writeText(display.row.prompt)
                .then(() => toast("画面描述已复制"));
          }}
          onReuse={() => display && reuseParams(display.row.id)}
          onEdit={editImage}
          onInpaint={startInpaintFromResult}
          onViewMask={display.row.inpaint ? openViewMask : undefined}
          onAdjustInpaint={
            display.row.inpaint
              ? () => adjustInpaint(display!.row.id)
              : undefined
          }
          onDelete={() => display && deleteRecord(display.row.id)}
          onToggleStar={() => {
            if (display) toggleStar(display.row.id);
          }}
          onNew={newGeneration}
          onClose={() => display && setDetailClosedFor(display.row.id)}
        />
      )}

      <CreateBar
        mode={barMode}
        generating={!!gen}
        done={doneGen}
        partialIndex={gen?.partial?.index ?? 0}
        form={draft.form}
        customValid={customOk(draft.form)}
        images={draftImages}
        inputFidelity={draft.inputFidelity}
        reading={reading}
        uploadError={draft.uploadError}
        canReturn={canReturn}
        sketchSize={sketchSize}
        inpaint={inpaintInfo}
        promptRef={promptRef}
        onPatch={patchForm}
        onGenerate={generate}
        onCancel={cancelGenerate}
        onFiles={(files) => {
          void addFiles(files);
        }}
        onRemove={removeInput}
        onPreview={setPreviewId}
        onOpenSketch={openSketchNew}
        onEditSketch={editSketchAttachment}
        onInputFidelity={setInputFidelity}
        onExpand={expandBar}
        onReturn={returnToResult}
        onAgain={() => doneGen && regenerate(doneGen.row.id)}
        onTweak={() => {
          if (doneGen) reuseParams(doneGen.row.id);
        }}
        onDownloadAll={downloadAll}
        onUseAsRef={addAsReference}
        onStartInpaint={startInpaintFromInput}
        onEditMask={editMask}
        onRemoveMask={removeMask}
        onAcceptSize={acceptSize}
      />

      <HistoryDrawer
        open={drawerOpen}
        rows={rows}
        thumbnailUrls={thumbnailUrls}
        currentId={display?.row.id ?? null}
        onSelect={(id) => {
          selectHistory(id);
          closeDrawer();
        }}
        onToggleStar={toggleStar}
        onClose={closeDrawer}
      />

      <SettingsModal
        key={settingsOpen ? "settings-open" : "settings-closed"}
        open={settingsOpen}
        baseUrl={baseUrl}
        apiKey={apiKey}
        storageText={`本地已存 ${rows.length} 次 · ${totalImages} 张${usageText}`}
        theme={theme.pref}
        onThemeChange={theme.setPref}
        onTest={testConnection}
        onSave={saveSettings}
        onClose={closeSettings}
      />
      {display && !gen && display.images.length > 1 && focusIdx !== null && (
        <Carousel
          img={display.images[focusIdx]}
          prompt={display.row.prompt}
          index={focusIdx}
          total={display.images.length}
          onPrev={() => {
            const n = display!.images.length;
            setFocusIdx((focusIdx! - 1 + n) % n);
          }}
          onNext={() => {
            const n = display!.images.length;
            setFocusIdx((focusIdx! + 1) % n);
          }}
          onClose={() => setFocusIdx(null)}
          onZoom={() => openLightbox(display!.images[focusIdx!].id)}
          onDownload={() => downloadOne(focusIdx!)}
          onReuse={() => reuseParams(display!.row.id)}
          onEdit={pending ? undefined : editSelected}
          onDelete={() => deleteRecord(display!.row.id)}
        />
      )}
      <ConfirmDialog state={confirm} onCancel={closeConfirm} />
      <Lightbox
        img={lightbox}
        prompt={display?.row.prompt ?? ""}
        onDownload={() => {
          const idx =
            display?.images.findIndex((image) => image.id === lightbox?.id) ??
            -1;
          if (idx >= 0) downloadOne(idx);
        }}
        onReuse={() => {
          closeLightbox();
          if (display) reuseParams(display.row.id);
        }}
        onClose={closeLightbox}
      />
      <InputPreview
        key={previewId ?? "closed"}
        image={
          (display ? sourceImages : draftImages).find(
            (image) => image.id === previewId,
          ) ?? null
        }
        onContinueSketch={
          previewId &&
          (display ? sourceImages : draftImages).some(
            (image) => image.id === previewId && image.isSketch,
          )
            ? () => continueHistorySketch(previewId)
            : undefined
        }
        onClose={() => setPreviewId(null)}
      />
      {drawing?.kind === "sketch" && (
        <SketchModal
          key={drawing.id}
          doc={drawing.doc}
          cursor={drawing.cursor}
          meta={drawing.meta}
          confirming={drawing.confirming}
          onStroke={strokeDrawing}
          onClear={() => strokeDrawing({ type: "clear" })}
          onUndo={undoDrawing}
          onRedo={redoDrawing}
          onConfirm={confirmSketch}
          onRequestClose={requestCloseSketch}
          onLimit={onDrawLimit}
        />
      )}
      {drawing?.kind === "inpaint" && inpaintBaseUrl && (
        <InpaintModal
          key={drawing.id}
          baseUrl={inpaintBaseUrl}
          name={drawing.name}
          baseW={drawing.base.width}
          baseH={drawing.base.height}
          normalized={drawing.normalized}
          doc={drawing.doc}
          cursor={drawing.cursor}
          confirming={drawing.confirming}
          error={drawing.error}
          onStroke={strokeDrawing}
          onClear={() => strokeDrawing({ type: "clear" })}
          onUndo={undoDrawing}
          onRedo={redoDrawing}
          onConfirm={confirmInpaint}
          onRequestClose={requestCloseInpaint}
          onLimit={onDrawLimit}
        />
      )}
      {drawing?.kind === "opening" && (
        <p className="pm-saving" role="status">
          正在读取底图…
        </p>
      )}
      {viewMask && viewMaskUrl && (
        <MaskViewModal
          baseUrl={viewMaskUrl}
          name={viewMask.name}
          baseW={viewMask.base.width}
          baseH={viewMask.base.height}
          commands={viewMask.commands}
          onAdjust={adjustFromViewMask}
          onClose={closeViewMask}
        />
      )}
      {run.phase === "saving" && (
        <p className="pm-saving" role="status">
          正在保存到本地…
        </p>
      )}
    </>
  );
}
