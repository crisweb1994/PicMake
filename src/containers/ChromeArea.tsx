/** 页面框架：顶栏、历史抽屉与设置弹窗；主题与本机存储用量在这里投影 */
import { useEffect, useState } from "react";
import { TopNav } from "../components/TopNav";
import { HistoryDrawer } from "../components/overlays/HistoryDrawer";
import { SettingsModal } from "../components/overlays/SettingsModal";
import { saveSettings, testConnection } from "../flows/settings";
import { selectHistory, toggleStar } from "../flows/navigation";
import { useTheme } from "../hooks/useTheme";
import type { WorkspaceAssets } from "../hooks/useWorkspaceAssets";
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
  const locale = useSettings((s) => s.locale);
  const setLocale = useSettings((s) => s.setLocale);
  const drawerOpen = useWorkspace((s) => s.view.drawerOpen);
  const settingsOpen = useWorkspace((s) => s.view.settingsOpen);

  const [usageBytes, setUsageBytes] = useState<number | null>(null);
  useEffect(() => {
    void navigator.storage?.estimate?.().then((est) => {
      if (est?.usage != null) setUsageBytes(est.usage);
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
        storage={{
          generations: rows.length,
          images: totalImages,
          usageBytes,
        }}
        theme={theme.pref}
        onThemeChange={theme.setPref}
        locale={locale}
        onLocaleChange={setLocale}
        onTest={testConnection}
        onSave={saveSettings}
        onClose={closeSettings}
      />
    </>
  );
}
