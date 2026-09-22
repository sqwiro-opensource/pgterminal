import { ipcMain } from 'electron';
import { INVOKE_CHANNELS } from '@shared/ipc';
import { registeredChannels } from './handle';
import { registerAppIpc } from './app.ipc';
import { registerConnectionsIpc } from './connections.ipc';
import { registerDdlIpc } from './ddl.ipc';
import { registerWorkspaceIpc } from './workspace.ipc';
import { registerSettingsIpc } from './settings.ipc';
import { registerCatalogIpc } from './catalog.ipc';
import { registerQueryIpc } from './query.ipc';
import { registerSessionIpc } from './session.ipc';
import { registerHistoryIpc } from './history.ipc';
import { registerDoclinkIpc } from './doclink.ipc';
import { registerRowsIpc } from './rows.ipc';
import { registerStatsIpc } from './stats.ipc';
import { registerExportIpc } from './export.ipc';

/**
 * Registers every `*.ipc.ts` module, then installs a throwing stub for any channel in the
 * contract that nothing implemented yet, so the renderer gets a rejection instead of a hang.
 */
export function registerIpc(): void {
  registerAppIpc();
  registerConnectionsIpc();

  registerDdlIpc();
  registerWorkspaceIpc();
  registerSettingsIpc();
  registerCatalogIpc();
  registerQueryIpc();
  registerSessionIpc();
  registerHistoryIpc();
  registerDoclinkIpc();
  registerRowsIpc();
  registerStatsIpc();
  registerExportIpc();

  for (const channel of INVOKE_CHANNELS) {
    if (registeredChannels.has(channel)) continue;
    registeredChannels.add(channel);
    ipcMain.handle(channel, async () => {
      throw new Error(`not implemented: ${channel}`);
    });
  }
}
