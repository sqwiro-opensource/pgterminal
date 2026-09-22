import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { InvokeChannel, IpcPushMap, IpcReq, IpcRes, PushChannel } from '@shared/ipc';

/** Channels that have a real (or stub) handler registered. */
export const registeredChannels = new Set<InvokeChannel>();

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

/**
 * Typed wrapper over `ipcMain.handle`. Errors are re-thrown as plain `Error`s so that the
 * message survives structured cloning to the renderer.
 */
export function handle<K extends InvokeChannel>(
  channel: K,
  fn: (req: IpcReq<K>, event: IpcMainInvokeEvent) => Promise<IpcRes<K>> | IpcRes<K>
): void {
  if (registeredChannels.has(channel)) ipcMain.removeHandler(channel);
  registeredChannels.add(channel);
  ipcMain.handle(channel, async (event, req: IpcReq<K>) => {
    try {
      return await fn(req, event);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(message);
    }
  });
}

/** Push an event to every live window. */
export function push<K extends PushChannel>(channel: K, payload: IpcPushMap[K]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue;
    win.webContents.send(channel, payload);
  }
}
