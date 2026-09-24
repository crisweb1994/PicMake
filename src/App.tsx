/** 应用接线层：组合业务流程与查看状态，投影成各业务组件 props。
 *  布局（PRD §5.1，2026-09-23）：全幅舞台 + 底部 CreateBar + 舞台右上 DetailCard。 */
import { useEffect, useRef, useState } from "react";
import { TopNav } from "./components/TopNav";
import { Stage } from "./components/Stage";
import { CreateBar } from "./components/bar/CreateBar";
import { DetailCard } from "./components/DetailCard";
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
import { useViewUi } from "./hooks/useViewUi";
import { fmtBytes } from "./lib/format";
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

  // full 态点条外收起：仅在无草稿（未改过任何字段、无输入图、无编辑来源）时
  useEffect(() => {
    if (barMode !== "full") return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        !t ||
        t.closest(".pm-bar") ||
        t.closest(".pm-detail") ||
        t.closest(".modal__backdrop")
      )
        return;
      if (!form.dirty && !form.images.length && !pm.canReturn)
        setBarMode("mini");
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [barMode, form.dirty, form.images.length, pm.canReturn]);

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
        promptRef={form.promptRef}
        onPatch={form.patchForm}
        onGenerate={pm.generate}
        onCancel={pm.cancelGenerate}
        onFiles={(files) => {
          void form.addFiles(files);
        }}
        onRemove={(id) => form.removeInput(id)}
        onPreview={setPreviewId}
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
        onClose={() => setPreviewId(null)}
      />
      {pm.saving && (
        <p className="pm-saving" role="status">
          正在保存到本地…
        </p>
      )}
    </>
  );
}
