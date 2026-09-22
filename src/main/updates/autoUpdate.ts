/**
 * Auto-update wiring. Unlike the legacy implementation this never opens a native dialog:
 * every state change is pushed to the renderer as `app:updateEvent` and surfaced as a toast.
 * Listeners are registered exactly once per process, not per window.
 */
import { app } from 'electron';
import electronUpdater, { type AppUpdater } from 'electron-updater';
import { push } from '../ipc/handle';

const { autoUpdater } = electronUpdater;

let installed = false;
/** True between `update-downloaded` and quit; gates `quitAndInstall`. */
let downloaded = false;

/** Update checks only run in a packaged app; the env var lets a local generic server be tested. */
function updatesEnabled(): boolean {
  return app.isPackaged || process.env.PGT_FORCE_UPDATE_CHECK === '1';
}

function logError(err: unknown): void {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`[update] ${msg}\n`);
}

/** Registers the updater listeners once and kicks off the first check. Safe to call repeatedly. */
export function installAutoUpdate(): void {
  if (installed) return;
  installed = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on('checking-for-update', () => push('app:updateEvent', { type: 'none' }));
  autoUpdater.on('update-not-available', () => push('app:updateEvent', { type: 'none' }));
  autoUpdater.on('update-available', (info: { version?: string }) => {
    push('app:updateEvent', { type: 'available', version: info?.version });
  });
  autoUpdater.on('update-downloaded', (info: { version?: string }) => {
    downloaded = true;
    push('app:updateEvent', { type: 'downloaded', version: info?.version });
  });
  // electron-updater emits `error` on every network hiccup; swallowing it here keeps main alive.
  autoUpdater.on('error', (err: Error) => {
    logError(err);
    push('app:updateEvent', { type: 'error', message: err?.message ?? String(err) });
  });

  void checkForUpdates();
}

/** Asks the update server for a newer version. Never throws. */
export async function checkForUpdates(): Promise<void> {
  if (!updatesEnabled()) {
    push('app:updateEvent', { type: 'none' });
    return;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    logError(err);
    push('app:updateEvent', { type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
}

/** Restarts into the downloaded update. No-op when no download completed. */
export function quitAndInstall(): void {
  if (!downloaded) return;
  autoUpdater.quitAndInstall();
}

/** Exposed for tests. */
export function updater(): AppUpdater {
  return autoUpdater;
}
