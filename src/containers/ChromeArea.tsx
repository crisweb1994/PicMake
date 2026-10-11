/** 页面框架：顶栏、历史抽屉与设置弹窗；主题与本机存储用量在这里投影 */
import { useEffect, useState } from "react";
import { TopNav } from "../components/TopNav";
import { HistoryDrawer, SettingsModal } from "../components/Overlays";
import { saveSettings, testConnection } from "../flows/settings";
import { selectHistory, toggleStar } from "../flows/navigation";
import { useTheme } from "../hooks/useTheme";
import type { WorkspaceAssets } from "../hooks/useWorkspaceAssets";
import { fmtBytes } from "../lib/format";
import { useSettings } from "../store/settings";
import { useWorkspace } from "../store/workspace";
import {
  closeDrawer,
  closeSettings,
  openDrawer,
  openSettings,
} from "../store/workspace/actions";

export function ChromeArea({ assets }: { assets: WorkspaceAssets }) {
  const { rows, display, thumbnailUrls } = assets;
  const theme = useTheme();
  const baseUrl = useSettings((s) => s.baseUrl);
  const apiKey = useSettings((s) => s.apiKey);
  const drawerOpen = useWorkspace((s) => s.view.drawerOpen);
  const settingsOpen = useWorkspace((s) => s.view.settingsOpen);

  const [usageText, setUsageText] = useState("");
  useEffect(() => {
    void navigator.storage?.estimate?.().then((est) => {
      if (est?.usage != null) setUsageText(` · 已用 ${fmtBytes(est.usage)}`);
    });
  }, [rows.length]);
  const totalImages = rows.reduce((sum, row) => sum + row.imageIds.length, 0);

  return (
    <>
      <TopNav
        theme={theme.resolved}
        onToggleTheme={theme.toggle}
        onHistory={openDrawer}
        onSettings={openSettings}
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
    </>
  );
}
