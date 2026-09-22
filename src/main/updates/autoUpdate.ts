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
/**
 * Whether the check in flight was asked for by a person. electron-updater's events carry no
 * context of their own, so the flag is held here for the duration of one check.
 */
let manualCheck = false;

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
  // Without this electron-updater refuses to run outside a packaged app and returns silently,
  // so PGT_FORCE_UPDATE_CHECK would look like a check that answers nothing.
  if (!app.isPackaged && process.env.PGT_FORCE_UPDATE_CHECK === '1') {
    autoUpdater.forceDevUpdateConfig = true;
  }

  autoUpdater.on('checking-for-update', () => push('app:updateEvent', { type: 'checking', manual: manualCheck }));
  autoUpdater.on('update-not-available', () => push('app:updateEvent', { type: 'none', manual: manualCheck }));
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
    push('app:updateEvent', { type: 'error', message: err?.message ?? String(err), manual: manualCheck });
  });

  void checkForUpdates();
}

/**
 * Asks the update server for a newer version. Never throws.
 *
 * `manual` marks a check a person asked for, so the renderer can answer it even when the answer
 * is "nothing new" — an automatic check that said that on every launch would be noise.
 */
export async function checkForUpdates({ manual = false }: { manual?: boolean } = {}): Promise<void> {
  manualCheck = manual;
  if (!updatesEnabled()) {
    push('app:updateEvent', { type: 'none', manual, unsupported: true });
    manualCheck = false;
    return;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    logError(err);
    push('app:updateEvent', { type: 'error', message: err instanceof Error ? err.message : String(err), manual });
  } finally {
    manualCheck = false;
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
