/** 应用接线层：组合业务流程与查看状态，投影成各业务组件 props。 */
import { useEffect, useState } from "react";
import { TopNav } from "./components/TopNav";
import { Stage } from "./components/Stage";
import { DetailPanel, GeneratePanel } from "./components/Inspector";
import {
  Carousel,
  ConfirmDialog,
  ErrorIsland,
  HistoryDrawer,
  Lightbox,
  SettingsModal,
} from "./components/Overlays";
import { useHistory } from "./hooks/useHistory";
import { useForm } from "./hooks/useForm";
import { useEdit } from "./hooks/useEdit";
import { usePicmake } from "./hooks/usePicmake";
import { useViewUi } from "./hooks/useViewUi";
import { fmtBytes } from "./lib/format";
import { useSettingsModal } from "./hooks/useSettings";
import { toast } from "@heroui/react";

function downloadUrl(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function App() {
  const { settingsOpen, saveSettings, openSettings, closeSettings } =
    useSettingsModal();
  const view = useViewUi();
  const form = useForm();
  const edit = useEdit();
  const history = useHistory(edit.editDraft?.source.imageId);
  const pm = usePicmake({
    history,
    form,
    edit,
    onViewReset: view.clearViewingState,
    onEditGenerationStart: view.clearResultViewingState,
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

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
  const testConn = pm.runTestConnection;
  const totalImages = history.rows.reduce((s, r) => s + r.imageIds.length, 0);

  return (
    <>
      <div className="pm-stage-col">
        <Stage
          contextImage={
            edit.editDraft
              ? (history.display?.images.find(
                  (image) => image.id === edit.editDraft?.source.imageId,
                ) ?? null)
              : null
          }
          phase={pm.phase}
          partial={pm.partial}
          display={history.display}
          onFocus={view.setFocusIdx}
          onLightbox={(id) =>
            view.setLightbox(
              history.display?.images.find((image) => image.id === id) ?? null,
            )
          }
          onDownload={downloadOne}
          onDownloadAll={() =>
            history.display?.images.forEach((_, i) => downloadOne(i))
          }
          onReuse={() => history.display && pm.reuseParams(history.display.row)}
          onEdit={history.pendingSave ? undefined : editSelected}
          onDelete={() => history.display && pm.deleteGen(history.display.row)}
          onCancel={pm.cancelGenerate}
          onStart={pm.newGeneration}
        />
        <ErrorIsland
          error={pm.error}
          onEdit={pm.goEditPrompt}
          onRetry={pm.retry}
          onDiscard={pm.discardPending}
        />
      </div>

      <TopNav onHistory={() => setDrawerOpen(true)} onSettings={openSettings} />

      <aside className="pm-island pm-insp" aria-label="检查器">
        {history.display && pm.phase === "idle" && !edit.editDraft ? (
          <DetailPanel
            display={history.display}
            selectedImageId={selectedImageId}
            canEdit={!history.pendingSave}
            sourceUrl={history.sourceUrl}
            sourceExists={history.sourceExists}
            onViewSource={() => view.setSourceLightboxOpen(true)}
            onDownload={() => downloadOne(view.focusIdx ?? 0)}
            onCopyPrompt={() => {
              if (history.display)
                void navigator.clipboard
                  ?.writeText(history.display.row.prompt)
                  .then(() => toast("画面描述已复制"));
            }}
            onReuse={() =>
              history.display && pm.reuseParams(history.display.row)
            }
            onEdit={pm.editImage}
            onDelete={() =>
              history.display && pm.deleteGen(history.display.row)
            }
            onNew={pm.newGeneration}
          />
        ) : (
          <GeneratePanel
            sourceUrl={history.sourceUrl}
            inputFidelity={edit.editDraft?.inputFidelity}
            onInputFidelity={edit.setInputFidelity}
            onCloseEdit={pm.closeEdit}
            form={form.form}
            customValid={form.customValid}
            generating={pm.phase === "generating"}
            promptRef={form.promptRef}
            onPatch={form.patchForm}
            onGenerate={pm.generate}
          />
        )}
      </aside>

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
        onClose={() => setDrawerOpen(false)}
      />

      <SettingsModal
        key={settingsOpen ? "settings-open" : "settings-closed"}
        open={settingsOpen}
        baseUrl={pm.settings.baseUrl}
        apiKey={pm.settings.apiKey}
        storageText={`本地已存 ${history.rows.length} 次 · ${totalImages} 张${usageText}`}
        onTest={testConn}
        onSave={saveSettings}
        onClose={closeSettings}
      />
      {history.display &&
        !edit.editDraft &&
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
      <Lightbox
        img={
          view.sourceLightboxOpen && history.sourceUrl
            ? { id: "source", url: history.sourceUrl }
            : null
        }
        prompt={history.sourceExists ? "来源作品" : "来源作品已删除"}
        onDownload={() =>
          history.sourceUrl &&
          downloadUrl(
            history.sourceUrl,
            `PicMake-source.${history.sourceFormat === "jpeg" ? "jpg" : (history.sourceFormat ?? "png")}`,
          )
        }
        onClose={() => view.setSourceLightboxOpen(false)}
      />
    </>
  );
}
