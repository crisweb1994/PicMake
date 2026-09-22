/** 设置存储：API 地址 + Key + 主题偏好，仅存 localStorage（MVP 文档 §1.4） */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_BASE_URL } from "../lib/url";
import { DEFAULT_THEME, type ThemePref } from "../lib/theme";

interface SettingsState {
  baseUrl: string;
  apiKey: string;
  theme: ThemePref;
  setApi: (baseUrl: string, apiKey: string) => void;
  setTheme: (theme: ThemePref) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      baseUrl: DEFAULT_BASE_URL,
      apiKey: "",
      theme: DEFAULT_THEME,
      setApi: (baseUrl, apiKey) => set({ baseUrl, apiKey }),
      setTheme: (theme) => set({ theme }),
    }),
    { name: "PicMake-settings" },
  ),
);
