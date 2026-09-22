import { handle } from './handle';
import { getSettings, setSettings } from '@main/store/stores';

export function registerSettingsIpc(): void {
  handle('settings:get', () => getSettings());
  handle('settings:set', (patch) => setSettings(patch));
}
