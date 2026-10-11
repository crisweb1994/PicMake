/** 应用接线层：组合业务流程与查看状态，投影成各业务组件 props */
import { useEffect, useRef, useState } from "react";
import { TopNav } from "./components/TopNav";
import { Stage } from "./components/Stage";
import { CreateBar } from "./components/bar/CreateBar";
import { DetailCard } from "./components/DetailCard";
import { SketchModal } from "./components/SketchModal";
import { InpaintModal, MaskViewModal } from "./components/InpaintModal";
import { useInpaint } from "./hooks/useInpaint";
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
import { db } from "./db/schema";
import { downloadName } from "./lib/download";
import { fmtBytes } from "./lib/format";
import { formSize } from "./lib/params";
import { SKETCH_DEFAULT_SIZE } from "./lib/sketch";
import {
  ERROR_HINTS,
  INPAINT_ISSUE_HINTS,
  MAX_INPUT_IMAGES,
} from "./lib/types";
import {
  canOpenDrawing,
  canWheelSwitch,
  hasUserWork,
  shouldCollapseBar,
} from "./lib/workspace-rules";
import { useObjectUrl } from "./hooks/useObjectUrl";
import { startHistorySync } from "./flows/history-sync";
import { saveSettings, testConnection } from "./flows/settings";
import { useSettings } from "./store/settings";
import { useWorkspace } from "./store/workspace";
import {
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
  resetView,
  setBarMode,
  setConfirm,
  setFocusIdx,
  setPreviewId,
  showViewMask,
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
  const form = useForm();
  const history = useHistory();
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
  const pm = usePicmake({ history, form });
  // 历史列表订阅：IndexedDB 变更回推到 store，卸载时退订
  useEffect(() => startHistorySync(), []);
  /** 详情浮卡的手动收起按记录 id 记忆：换记录后自动重新出现 */
  const [detailClosedFor, setDetailClosedFor] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const lightbox =
    history.display?.images.find((image) => image.id === lightboxId) ?? null;
  const viewMaskUrl = useObjectUrl(viewMask?.base.blob);

  // focusSeq 变化即聚焦描述框（展开创作条、草稿落位）；promptRef 引用稳定，只响应聚焦意图
  const { promptRef } = form;
  useEffect(() => {
    if (focusSeq) requestAnimationFrame(() => promptRef.current?.focus());
  }, [focusSeq, promptRef]);

  /* ── 局部重绘：弹层涂选只产出草稿附件，确认回创作条，不发请求 ── */
  // draft-input 入口被涂选的原输入 id（确认后重排为图1）
  const inpaintChosenRef = useRef<string | null>(null);
  const inpaint = useInpaint({
    onApply: ({ base, mask, original, entry }) => {
      if (entry === "result") {
        // 仅带入该结果；确认后切到重绘草稿
        form.initialize(undefined, [
          { imageId: base.id, name: "底图", upload: base },
        ]);
        form.applyInpaint({ base, mask, original, entry });
        history.select(null);
        clearDone();
        resetView();
        openBar();
        toast("选区已应用：填写修改描述后生成");
      }
      if (entry === "draft-input") {
        const chosen = inpaintChosenRef.current;
        const reorder = !!chosen && form.inputs.length > 1;
        form.applyInpaint({ base, mask, original, entry }, chosen ?? undefined);
        inpaintChosenRef.current = null;
        openBar();
        toast(
          reorder
            ? "底图已设为图1，图片编号已更新，请检查描述"
            : "选区已应用：填写修改描述后生成",
        );
      }
      if (entry === "reedit") {
        form.applyInpaint({ base, mask, original, entry });
        toast("选区已更新");
      }
    },
  });

  /** 各画板/重绘入口共用的可用判定（事件里调用），规则见 canOpenDrawing */
  const workspaceFree = () =>
    canOpenDrawing({
      run: pm.currentRunPhase(),
      reading: form.reading,
      confirming: !!confirm,
      drawing: !!sketch.session || !!inpaint.session || inpaint.opening,
    });

  /** 对展示记录的某一张结果发起；打开前经放弃确认 */
  const startInpaintFromResult = (imageId: string) => {
    if (!workspaceFree()) return;
    const display = history.display;
    if (!display) return;
    pm.requestLeave(() => {
      void db.images.get(imageId).then(async (row) => {
        if (!row) {
          toast(ERROR_HINTS["source-unavailable"]);
          return;
        }
        const result = await inpaint.open({
          blob: row.blob,
          name: `结果 · ${display.row.prompt.slice(0, 12)}…`,
          entry: "result",
          existing: { imageId, generationId: display.row.id },
        });
        if (!result.ok) toast(INPAINT_ISSUE_HINTS[result.issue]);
      });
    }, true);
  };

  /** 对草稿中的普通图发起；确认后重排为图1（✎ 按钮已保证草图走画板） */
  const startInpaintFromInput = (imageId: string) => {
    if (!workspaceFree()) return;
    const input = form.inputs.find((item) => item.imageId === imageId);
    if (!input) return;
    void (async () => {
      const row = input.upload ?? (await db.images.get(imageId));
      if (!row) {
        toast(ERROR_HINTS["source-unavailable"]);
        return;
      }
      inpaintChosenRef.current = imageId;
      const result = await inpaint.open({
        blob: row.blob,
        name: input.name ?? "图片",
        entry: "draft-input",
        existing: input.generationId
          ? { imageId, generationId: input.generationId }
          : { imageId },
      });
      if (!result.ok) {
        inpaintChosenRef.current = null;
        toast(INPAINT_ISSUE_HINTS[result.issue]);
      }
    })();
  };

  /** 重开已确认选区：底图缩略图 ✎（选区存在时 inputs[0] 恒为绑定底图） */
  const editMask = () => {
    if (!workspaceFree() || !form.inpaint) return;
    const baseInput = form.inputs[0];
    void (async () => {
      const base = baseInput.upload ?? (await db.images.get(baseInput.imageId));
      if (!base) {
        toast(ERROR_HINTS["source-unavailable"]);
        return;
      }
      const result = await inpaint.open({
        blob: base.blob,
        name: baseInput.name ?? "底图",
        entry: "reedit",
        existing: { imageId: base.id },
        reedit: {
          base,
          mask: form.inpaint!.mask,
          ...(form.inpaint!.original
            ? { original: form.inpaint!.original }
            : {}),
        },
      });
      if (!result.ok) toast(INPAINT_ISSUE_HINTS[result.issue]);
    })();
  };

  const requestCloseInpaint = () => {
    if (inpaint.confirming) return;
    if (inpaint.changed) {
      setConfirm({
        title: "放弃本次选区修改？",
        desc: "未确认的涂选不会保存；已确认的选区保持不变。",
        okLabel: "放弃修改",
        cancelLabel: "继续编辑",
        onOk: inpaint.close,
      });
      return;
    }
    inpaint.close();
  };

  /** 查看选区（只读），可发起「调整上次重绘」 */
  const openViewMask = () => {
    const row = history.display?.row;
    const inp = row?.inpaint;
    if (!row || !inp) return;
    void (async () => {
      const maskRow = await db.images.get(inp.maskImageId);
      const baseRow = maskRow?.mask
        ? await db.images.get(maskRow.mask.baseImageId)
        : null;
      if (!maskRow?.mask || !baseRow) {
        toast("选区数据无法读取，请重新选择修改区域");
        return;
      }
      showViewMask({
        base: baseRow,
        name: row.inputSources?.[0]?.name ?? "底图",
        commands: maskRow.mask.commands,
        rowId: row.id,
      });
    })();
  };

  /* ── 草图画板：只产出附件，确认落回创作条，不发请求 ── */
  const sketch = useSketch({
    onApply: ({ image, replaces }) => {
      const wasEmpty = !replaces && form.inputs.length === 0;
      const sizeBefore = formSize(form.form);
      const promptEmpty = !form.form.prompt.trim();
      if (!form.applySketch(image, replaces)) return false;
      // 草图首次成为唯一输入且输出为 auto：设为草图尺寸
      if (wasEmpty && sizeBefore === "auto") {
        form.patchForm({ cw: String(image.width), ch: String(image.height) });
        toast(`输出尺寸已设为草图尺寸 ${image.width} × ${image.height}`);
      }
      // 首次添加草图且描述为空：填入起始文字（不覆盖已有）
      if (!replaces && promptEmpty) {
        form.patchForm({
          prompt: `以图${form.inputs.length + 1}的草图为构图参考，保留主体的相对位置与比例，将粗略线条转成完整画面。`,
        });
      }
      openBar();
      return true;
    },
  });
  /** 已确认草图的逻辑尺寸（比例不一致提示） */
  const sketchInput = form.inputs.find((input) => input.upload?.sketch);
  const sketchSize = sketchInput?.upload
    ? { w: sketchInput.upload.width, h: sketchInput.upload.height }
    : null;

  /** 新画布 = 当前输出尺寸，auto 时 1024×1024 */
  const openSketchNew = () => {
    if (!workspaceFree()) return;
    if (
      !form.images.some((image) => image.isSketch) &&
      form.inputs.length >= MAX_INPUT_IMAGES
    ) {
      toast(ERROR_HINTS["too-many-images"]);
      return;
    }
    const size = formSize(form.form);
    sketch.openBlank(
      ...(size === "auto"
        ? ([SKETCH_DEFAULT_SIZE, SKETCH_DEFAULT_SIZE] as const)
        : ([size.w, size.h] as const)),
    );
  };

  const editAttachmentSketch = (imageId: string) => {
    if (!workspaceFree()) return;
    const idx = form.inputs.findIndex((input) => input.imageId === imageId);
    const doc = form.inputs[idx]?.upload?.sketch;
    if (!doc) return;
    sketch.openEdit(doc, imageId, idx);
  };

  /** 历史来源草图：以新草稿打开，不改旧记录 */
  const continueHistorySketch = (imageId: string) => {
    if (!workspaceFree()) return;
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
      setConfirm({
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

  const [usageText, setUsageText] = useState("");
  useEffect(() => {
    void navigator.storage?.estimate?.().then((est) => {
      if (est?.usage != null) setUsageText(` · 已用 ${fmtBytes(est.usage)}`);
    });
  }, [history.rows.length]);

  const downloadOne = (idx: number) => {
    if (!history.display) return;
    const im = history.display.images[idx];
    downloadUrl(im.url, downloadName(history.display.row.id, idx, im.format));
  };
  const downloadAll = () =>
    history.display?.images.forEach((_, i) => downloadOne(i));

  const selectedImageId = history.display
    ? history.display.images.length === 1
      ? history.display.images[0].id
      : focusIdx !== null
        ? (history.display.images[focusIdx]?.id ?? null)
        : null
    : null;
  const editSelected = () => {
    if (selectedImageId) pm.editImage(selectedImageId);
  };
  const totalImages = history.rows.reduce((s, r) => s + r.imageIds.length, 0);

  /** complete 态只在展示的确实是刚保存的那次生成时成立 */
  const doneGen =
    lastDoneId && history.display?.row.id === lastDoneId
      ? history.display
      : null;

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
          userWork: hasUserWork({ dirty: form.dirty, reading: form.reading }),
          inputCount: form.images.length,
          canReturn: pm.canReturn,
        })
      )
        setBarMode("mini");
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [
    barMode,
    form.dirty,
    form.reading,
    form.images.length,
    pm.canReturn,
    sketch.session,
  ]);

  // 详情浮卡可见性：展示记录存在、非生成中、且未被用户收起（按记录 id 记忆）
  const detailVisible =
    !!history.display &&
    pm.phase === "idle" &&
    detailClosedFor !== history.display.row.id;

  // 舞台滚轮切换历史：规则见 canWheelSwitch，不满足时不挂监听
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const enabled = canWheelSwitch({
      run: pm.currentRunPhase(),
      userWork: hasUserWork({ dirty: form.dirty, reading: form.reading }),
      inputCount: form.inputs.length,
      overlayOpen:
        settingsOpen ||
        drawerOpen ||
        !!lightbox ||
        !!viewMask ||
        focusIdx !== null,
      drawing: !!sketch.session || !!inpaint.session || inpaint.opening,
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
    if (pm.currentRunPhase() !== "idle" || !history.display) return;
    const imageId = selectedImageId ?? history.display.images[0]?.id ?? null;
    if (!imageId) return;
    const idx = history.display.row.imageIds.indexOf(imageId);
    form.appendExisting(
      imageId,
      history.display.row.id,
      `已有作品 · 第 ${idx + 1} 张`,
    );
    clearDone();
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
          onFocus={setFocusIdx}
          onLightbox={openLightbox}
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
        onHistory={openDrawer}
        onSettings={openSettings}
      />

      {history.display && detailVisible && (
        <DetailCard
          display={history.display}
          selectedImageId={selectedImageId}
          canEdit={!history.pendingSave && !pm.saving}
          sources={history.sourceImages}
          onViewSource={setPreviewId}
          onDownload={() => downloadOne(focusIdx ?? 0)}
          onCopyPrompt={() => {
            if (history.display)
              void navigator.clipboard
                ?.writeText(history.display.row.prompt)
                .then(() => toast("画面描述已复制"));
          }}
          onReuse={() => history.display && pm.reuseParams(history.display.row)}
          onEdit={pm.editImage}
          onInpaint={startInpaintFromResult}
          onViewMask={history.display.row.inpaint ? openViewMask : undefined}
          onAdjustInpaint={
            history.display.row.inpaint
              ? () => pm.adjustInpaint(history.display!.row)
              : undefined
          }
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
        inpaint={form.inpaintInfo}
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
        onStartInpaint={startInpaintFromInput}
        onEditMask={editMask}
        onRemoveMask={form.removeMask}
        onAcceptSize={form.acceptSize}
      />

      <HistoryDrawer
        open={drawerOpen}
        rows={history.rows}
        thumbnailUrls={history.thumbnailUrls}
        currentId={history.display?.row.id ?? null}
        onSelect={(id) => {
          const row = history.rows.find((row) => row.id === id);
          if (row) void pm.selectHistory(row);
          closeDrawer();
        }}
        onToggleStar={(id) => void history.toggleStar(id)}
        onClose={closeDrawer}
      />

      <SettingsModal
        key={settingsOpen ? "settings-open" : "settings-closed"}
        open={settingsOpen}
        baseUrl={baseUrl}
        apiKey={apiKey}
        storageText={`本地已存 ${history.rows.length} 次 · ${totalImages} 张${usageText}`}
        theme={theme.pref}
        onThemeChange={theme.setPref}
        onTest={testConnection}
        onSave={saveSettings}
        onClose={closeSettings}
      />
      {history.display &&
        pm.phase === "idle" &&
        history.display.images.length > 1 &&
        focusIdx !== null && (
          <Carousel
            img={history.display.images[focusIdx]}
            prompt={history.display.row.prompt}
            index={focusIdx}
            total={history.display.images.length}
            onPrev={() => {
              const n = history.display!.images.length;
              setFocusIdx((focusIdx! - 1 + n) % n);
            }}
            onNext={() => {
              const n = history.display!.images.length;
              setFocusIdx((focusIdx! + 1) % n);
            }}
            onClose={() => setFocusIdx(null)}
            onZoom={() => openLightbox(history.display!.images[focusIdx!].id)}
            onDownload={() => downloadOne(focusIdx!)}
            onReuse={() => pm.reuseParams(history.display!.row)}
            onEdit={history.pendingSave ? undefined : editSelected}
            onDelete={() => pm.deleteGen(history.display!.row)}
          />
        )}
      <ConfirmDialog state={confirm} onCancel={closeConfirm} />
      <Lightbox
        img={lightbox}
        prompt={history.display?.row.prompt ?? ""}
        onDownload={() => {
          const idx =
            history.display?.images.findIndex(
              (image) => image.id === lightbox?.id,
            ) ?? -1;
          if (idx >= 0) downloadOne(idx);
        }}
        onReuse={() => {
          closeLightbox();
          if (history.display) pm.reuseParams(history.display.row);
        }}
        onClose={closeLightbox}
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
          onLimit={onDrawLimit}
        />
      )}
      {inpaint.session && (
        <InpaintModal
          baseUrl={inpaint.session.baseUrl}
          name={inpaint.session.name}
          baseW={inpaint.session.base.width}
          baseH={inpaint.session.base.height}
          normalized={inpaint.session.normalized}
          doc={inpaint.session.doc}
          cursor={inpaint.session.cursor}
          confirming={inpaint.confirming}
          error={inpaint.error}
          onStroke={inpaint.stroke}
          onClear={inpaint.clearAll}
          onUndo={inpaint.undo}
          onRedo={inpaint.redo}
          onConfirm={inpaint.confirm}
          onRequestClose={requestCloseInpaint}
          onLimit={onDrawLimit}
        />
      )}
      {inpaint.opening && (
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
          onAdjust={() => {
            const row = history.rows.find((r) => r.id === viewMask.rowId);
            closeViewMask();
            if (row) pm.adjustInpaint(row);
          }}
          onClose={closeViewMask}
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
