import { useCallback, useState } from "react";
import { useSettings } from "../store/settings";
import { toast } from "@heroui/react";

export const useSettingsModal = () => {
  const settings = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(
    () => !useSettings.getState().apiKey,
  );

  /** 保存设置（有 apiKey 即视为已引导，启动弹窗由它决定） */
  const saveSettings = useCallback(
    (baseUrl: string, apiKey: string) => {
      settings.setApi(baseUrl, apiKey);
      setSettingsOpen(false);
      toast("设置已保存");
    },
    [settings],
  );

  const openSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  return {
    settingsOpen,
    openSettings,
    closeSettings,
    setSettingsOpen,
    saveSettings,
  };
};
