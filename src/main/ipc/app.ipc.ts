import { app, shell } from 'electron';
import { handle } from './handle';
import { checkForUpdates, quitAndInstall } from '../updates/autoUpdate';

export function registerAppIpc(): void {
  handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron ?? 'unknown',
    platform: process.platform,
    dataDir: app.getPath('userData')
  }));

  handle('app:openExternal', async ({ url }) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Refusing to open malformed URL: ${url}`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Refusing to open non-http(s) URL: ${url}`);
    }
    await shell.openExternal(parsed.toString());
  });

  handle('app:checkForUpdates', async () => {
    await checkForUpdates();
  });

  handle('app:quitAndInstall', () => {
    quitAndInstall();
  });
}
