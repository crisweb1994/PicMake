/** 设置存储：仅存 localStorage */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_LOCALE_PREF, type LocalePref } from "../lib/locale";
import { DEFAULT_BASE_URL } from "../lib/url";
import { DEFAULT_THEME, type ThemePref } from "../lib/theme";

interface SettingsState {
  baseUrl: string;
  apiKey: string;
  theme: ThemePref;
  locale: LocalePref;
  setApi: (baseUrl: string, apiKey: string) => void;
  setTheme: (theme: ThemePref) => void;
  setLocale: (locale: LocalePref) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      baseUrl: DEFAULT_BASE_URL,
      apiKey: "",
      theme: DEFAULT_THEME,
      locale: DEFAULT_LOCALE_PREF,
      setApi: (baseUrl, apiKey) => set({ baseUrl, apiKey }),
      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => set({ locale }),
    }),
    { name: "PicMake-settings" },
  ),
);
