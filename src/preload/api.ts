import { ipcRenderer, type IpcRendererEvent } from 'electron';
import { INVOKE_CHANNELS, PUSH_CHANNELS, type PgTerminalApi, type PushChannel } from '@shared/ipc';

/**
 * Builds the allow-listed `window.pgterminal` API: one invoke wrapper per contract channel, plus
 * `on` for push events. Nothing else from Electron or Node is reachable from the renderer.
 */
export function createApi(): PgTerminalApi {
  const api: Record<string, unknown> = {};

  for (const channel of INVOKE_CHANNELS) {
    api[channel] = (req?: unknown) => ipcRenderer.invoke(channel, req);
  }

  const pushSet: ReadonlySet<string> = new Set(PUSH_CHANNELS);
  api.on = (channel: PushChannel, cb: (payload: unknown) => void) => {
    if (!pushSet.has(channel)) throw new Error(`Unknown push channel: ${String(channel)}`);
    const listener = (_event: IpcRendererEvent, payload: unknown) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  };

  return api as PgTerminalApi;
}
