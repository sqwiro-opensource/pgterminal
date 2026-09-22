import { DEFAULT_SETTINGS, type AppSettings } from '@shared/ipc';
import { getPgui } from '../lib/ipc';
import type { SliceCreator } from './index';

export interface SettingsSlice {
  settings: AppSettings;
  settingsLoaded: boolean;
  loadSettings(): Promise<void>;
  updateSettings(patch: Partial<AppSettings>): Promise<void>;
}

export const createSettingsSlice: SliceCreator<SettingsSlice> = (set) => ({
  settings: DEFAULT_SETTINGS,
  settingsLoaded: false,

  async loadSettings() {
    const settings = await getPgui()['settings:get']();
    set({ settings: { ...DEFAULT_SETTINGS, ...settings }, settingsLoaded: true });
  },

  async updateSettings(patch) {
    // Optimistic local merge; main returns the authoritative merged settings.
    set((s) => ({ settings: { ...s.settings, ...patch } }));
    const settings = await getPgui()['settings:set'](patch);
    set({ settings: { ...DEFAULT_SETTINGS, ...settings } });
  }
});
