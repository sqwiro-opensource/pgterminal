import { handle } from './handle';
import { loadWorkspace, saveWorkspace } from '@main/store/stores';

export function registerWorkspaceIpc(): void {
  handle('workspace:load', () => loadWorkspace());
  handle('workspace:save', (snapshot) => {
    saveWorkspace(snapshot);
  });
}
