import { useState } from "react";
import { useSettings } from "../store/settings";
import { toast } from "@heroui/react";
import { testConnection } from "../api/client";
import { ERROR_HINTS } from "../lib/types";

export const useSettingsModal = () => {
  const settings = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(
    () => !useSettings.getState().apiKey,
  );

  /** 保存设置（有 apiKey 即视为已引导，启动弹窗由它决定） */
  const saveSettings = (baseUrl: string, apiKey: string) => {
    settings.setApi(baseUrl, apiKey);
    setSettingsOpen(false);
    toast("设置已保存");
  };

  const runTestConnection = async (baseUrl: string, apiKey: string) => {
    const result = await testConnection({ baseUrl, apiKey });
    return result.ok
      ? result
      : { ok: false as const, message: ERROR_HINTS[result.error.kind] };
  };

  return {
    settingsOpen,
    runTestConnection,
    openSettings: () => setSettingsOpen(true),
    closeSettings: () => setSettingsOpen(false),
    saveSettings,
  };
};
