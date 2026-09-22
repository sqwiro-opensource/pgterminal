import { create, type StateCreator } from 'zustand';
import { createCatalogSlice, type CatalogSlice } from './catalog.slice';
import { createConnectionsSlice, type ConnectionsSlice } from './connections.slice';
import { createHistorySlice, type HistorySlice } from './history.slice';
import { createSettingsSlice, type SettingsSlice } from './settings.slice';
import { createUiSlice, type UiSlice } from './ui.slice';
import { createWorkspaceSlice, type WorkspaceSlice } from './workspace.slice';

export type RootState = ConnectionsSlice & CatalogSlice & SettingsSlice & UiSlice & WorkspaceSlice & HistorySlice;

/** Helper type for slice creators that can read the whole store. */
export type SliceCreator<T> = StateCreator<RootState, [], [], T>;

export const useStore = create<RootState>()((...a) => ({
  ...createConnectionsSlice(...a),
  ...createCatalogSlice(...a),
  ...createSettingsSlice(...a),
  ...createUiSlice(...a),
  ...createWorkspaceSlice(...a),
  ...createHistorySlice(...a)
}));

export type { ConnectionStatus } from './connections.slice';
export { activeConnectionId } from './workspace.slice';
export { isConnectionLost } from './connections.slice';

// Smoke-test hook: lets an automated main-process script drive the app through the real store/IPC.
// Harmless in production: the renderer is sandboxed and has no Node access.
declare global {
  interface Window {
    __pgtStore?: typeof useStore;
  }
}
if (typeof window !== 'undefined') window.__pgtStore = useStore;
