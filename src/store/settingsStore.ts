import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { browserStorage } from './browserStorage';

export const MIN_TEXT_PREVIEW_SIZE_MB = 1;
export const MAX_TEXT_PREVIEW_SIZE_MB = 100;

export type Language = 'en' | 'zh';

const detectLanguage = (): Language => {
  if (typeof navigator === 'undefined') return 'en';
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
};

interface SettingsState {
  language: Language;
  defaultRegion: string;
  maxConcurrentTransfers: number;
  transferBandwidthKiB: number;
  setLanguage: (language: Language) => void;
  setTransferBandwidthKiB: (value: number) => void;
  maxTextPreviewSizeMb: number;
  autoRefreshOnFocus: boolean;
  setDefaultRegion: (region: string) => void;
  setMaxConcurrentTransfers: (max: number) => void;
  setMaxTextPreviewSizeMb: (max: number) => void;
  setAutoRefreshOnFocus: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: detectLanguage(),
      defaultRegion: 'us-east-1',
      maxConcurrentTransfers: 5,
      transferBandwidthKiB: 0,
      setLanguage: (language) => set({ language }),
      setTransferBandwidthKiB: (value) => { if (Number.isInteger(value) && (value === 0 || (value >= 64 && value <= 1048576))) set({ transferBandwidthKiB: value }); },
      maxTextPreviewSizeMb: 2,
      autoRefreshOnFocus: false, // Disabled by default - can cause freezing on Ubuntu
      setDefaultRegion: (defaultRegion) => set({ defaultRegion }),
      setMaxConcurrentTransfers: (maxConcurrentTransfers) => set({ maxConcurrentTransfers }),
      setMaxTextPreviewSizeMb: (value) => set({
        maxTextPreviewSizeMb: Math.min(
          MAX_TEXT_PREVIEW_SIZE_MB,
          Math.max(MIN_TEXT_PREVIEW_SIZE_MB, Math.round(value))
        ),
      }),
      setAutoRefreshOnFocus: (autoRefreshOnFocus) => set({ autoRefreshOnFocus }),
    }),
    {
      name: 'arcax-settings',
      storage: browserStorage,
      version: 1,
      migrate: (persisted) => persisted as SettingsState,
    }
  )
);
