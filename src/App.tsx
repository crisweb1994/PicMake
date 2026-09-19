/** 应用接线层：消费 usePicmake，把状态投影成各业务组件 props，并挂全局快捷键 */
import { useEffect, useRef, useState } from "react";
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
  ToastHost,
} from "./components/Overlays";
import { usePicmake } from "./hooks/usePicmake";
import { fmtBytes } from "./lib/format";

function downloadUrl(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function App() {
  const pm = usePicmake();
  const pmRef = useRef(pm);
  useEffect(() => {
    pmRef.current = pm;
  });

  const [usageText, setUsageText] = useState("");
  useEffect(() => {
    void navigator.storage?.estimate?.().then((est) => {
      if (est?.usage != null) setUsageText(` · 已用 ${fmtBytes(est.usage)}`);
    });
  }, [pm.rows.length]);

  /* 全局快捷键（PRD FR-9） */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const pm = pmRef.current;
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        pm.generate();
        return;
      }
      if (e.key === "Escape") {
        if (pm.lightbox) return pm.setLightbox(null);
        if (pm.confirmState) return pm.setConfirmState(null);
        if (pm.settingsOpen) return pm.setSettingsOpen(false);
        if (pm.drawerOpen) return pm.setDrawerOpen(false);
        if (pm.error) return pm.goEditPrompt();
        if (pm.display && pm.display.images.length > 1 && pm.focusIdx !== null)
          return pm.setFocusIdx(null);
        if (pm.display) return pm.newGeneration();
        return;
      }
      // 轮播开着时 ←→ 切换（灯箱打开时不动）
      if (
        (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
        pm.display &&
        pm.display.images.length > 1 &&
        pm.focusIdx !== null &&
        !pm.lightbox
      ) {
        const n = pm.display.images.length;
        const d = e.key === "ArrowLeft" ? n - 1 : 1;
        pm.setFocusIdx((pm.focusIdx + d) % n);
        return;
      }
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        pm.display &&
        pm.phase === "idle"
      ) {
        const tag = document.activeElement?.tagName;
        if (tag === "TEXTAREA" || tag === "INPUT") return;
        pm.deleteGen(pm.display.row);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const downloadOne = (idx: number) => {
    if (!pm.display) return;
    const im = pm.display.images[idx];
    const ext =
      pm.display.row.params.outputFormat === "jpeg"
        ? "jpg"
        : pm.display.row.params.outputFormat;
    downloadUrl(im.url, `picmake-${pm.display.row.id.slice(0, 8)}.${ext}`);
  };

  const testConn = pm.runTestConnection;
  const totalImages = pm.rows.reduce((s, r) => s + r.imageIds.length, 0);

  return (
    <>
      <div className="pm-stage-col">
        <Stage
          phase={pm.phase}
          partial={pm.partial}
          display={pm.display}
          onFocus={pm.setFocusIdx}
          onLightbox={pm.setLightbox}
          onDownload={downloadOne}
          onDownloadAll={() =>
            pm.display?.images.forEach((_, i) => downloadOne(i))
          }
          onReuse={() => pm.display && pm.reuseParams(pm.display.row)}
          onAgain={() => pm.display && pm.againFrom(pm.display.row)}
          onDelete={() => pm.display && pm.deleteGen(pm.display.row)}
          onCancel={pm.cancelGenerate}
          onStart={pm.newGeneration}
        />
        <ErrorIsland
          error={pm.error}
          onEdit={pm.goEditPrompt}
          onRetry={pm.retry}
        />
      </div>

      <TopNav
        onHistory={() => pm.setDrawerOpen(true)}
        onSettings={() => pm.setSettingsOpen(true)}
      />

      <aside className="pm-island pm-insp" aria-label="检查器">
        {pm.display && pm.phase === "idle" ? (
          <DetailPanel
            display={pm.display}
            onDownload={() => downloadOne(pm.focusIdx ?? 0)}
            onCopyPrompt={() => {
              if (pm.display)
                void navigator.clipboard
                  ?.writeText(pm.display.row.prompt)
                  .then(() => pm.toast("画面描述已复制"));
            }}
            onReuse={() => pm.display && pm.reuseParams(pm.display.row)}
            onAgain={() => pm.display && pm.againFrom(pm.display.row)}
            onDelete={() => pm.display && pm.deleteGen(pm.display.row)}
            onNew={pm.newGeneration}
          />
        ) : (
          <GeneratePanel
            form={pm.form}
            estUsd={pm.estUsd}
            customValid={pm.customValid}
            generating={pm.phase === "generating"}
            onPatch={pm.patchForm}
            onGenerate={pm.generate}
          />
        )}
      </aside>

      <HistoryDrawer
        open={pm.drawerOpen}
        rows={pm.rows}
        currentId={pm.display?.row.id ?? null}
        onSelect={(r) => {
          void pm.selectHistory(r);
          pm.setDrawerOpen(false);
        }}
        onClose={() => pm.setDrawerOpen(false)}
      />

      <SettingsModal
        key={pm.settingsOpen ? "settings-open" : "settings-closed"}
        open={pm.settingsOpen}
        baseUrl={pm.settings.baseUrl}
        apiKey={pm.settings.apiKey}
        storageText={`本地已存 ${pm.rows.length} 次 · ${totalImages} 张${usageText}`}
        onTest={testConn}
        onSave={pm.saveSettings}
        onClose={() => pm.setSettingsOpen(false)}
      />
      {pm.display && pm.display.images.length > 1 && pm.focusIdx !== null && (
        <Carousel
          img={pm.display.images[pm.focusIdx]}
          prompt={pm.display.row.prompt}
          index={pm.focusIdx}
          total={pm.display.images.length}
          onPrev={() => {
            const n = pm.display!.images.length;
            pm.setFocusIdx((pm.focusIdx! - 1 + n) % n);
          }}
          onNext={() => {
            const n = pm.display!.images.length;
            pm.setFocusIdx((pm.focusIdx! + 1) % n);
          }}
          onClose={() => pm.setFocusIdx(null)}
          onZoom={() => pm.setLightbox(pm.display!.images[pm.focusIdx!])}
          onDownload={() => downloadOne(pm.focusIdx!)}
          onReuse={() => pm.reuseParams(pm.display!.row)}
          onAgain={() => pm.againFrom(pm.display!.row)}
          onDelete={() => pm.deleteGen(pm.display!.row)}
        />
      )}
      <ConfirmDialog
        state={pm.confirmState}
        onCancel={() => pm.setConfirmState(null)}
      />
      <Lightbox
        img={pm.lightbox}
        prompt={pm.display?.row.prompt ?? ""}
        onDownload={() =>
          pm.lightbox && downloadUrl(pm.lightbox.url, "picmake.png")
        }
        onReuse={() => {
          pm.setLightbox(null);
          if (pm.display) pm.reuseParams(pm.display.row);
        }}
        onClose={() => pm.setLightbox(null)}
      />
      <ToastHost toasts={pm.toasts} />
    </>
  );
}
