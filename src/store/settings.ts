/** 设置存储：API 地址 + Key，仅存 localStorage（MVP 文档 §1.4） */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_BASE_URL } from '../lib/url'

interface SettingsState {
  baseUrl: string
  apiKey: string
  setApi: (baseUrl: string, apiKey: string) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      baseUrl: DEFAULT_BASE_URL,
      apiKey: '',
      setApi: (baseUrl, apiKey) => set({ baseUrl, apiKey }),
    }),
    { name: 'PicMake-settings' },
  ),
)
