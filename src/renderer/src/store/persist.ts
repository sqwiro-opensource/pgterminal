import type { WorkspaceSnapshot } from '@shared/ipc';
import { getApi } from '../lib/ipc';
import { activeConnectionId } from './workspace.slice';
import { useStore } from './index';

const DEBOUNCE_MS = 500;

/** Builds the persisted snapshot. Contains only plain data — never `tabRuntime`. */
export function buildSnapshot(): WorkspaceSnapshot {
  const s = useStore.getState();
  return {
    version: 1,
    tabs: s.tabs,
    activeTabId: s.activeTabId,
    sidebar: { width: s.sidebarWidth, expandedNodeIds: [], activeConnectionId: activeConnectionId(s) }
  };
}

/**
 * Subscribes to the store and saves the workspace (debounced) whenever tabs, the active tab
 * or the sidebar layout change. Saving only starts after the workspace has been loaded, so a
 * boot never overwrites the previous session with an empty snapshot.
 */
export function startWorkspacePersistence(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = pick(useStore.getState());

  const flush = (): void => {
    timer = null;
    const save = getApi()['workspace:save'];
    save(buildSnapshot()).catch((err: Error) => console.warn('workspace:save failed', err.message));
  };

  const unsubscribe = useStore.subscribe((state) => {
    if (!state.workspaceLoaded) return;
    const next = pick(state);
    if (shallowEqual(next, last)) return;
    last = next;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  });

  return () => {
    unsubscribe();
    if (timer) {
      clearTimeout(timer);
      flush();
    }
  };
}

type Picked = ReturnType<typeof pick>;
function pick(s: ReturnType<typeof useStore.getState>) {
  return { tabs: s.tabs, activeTabId: s.activeTabId, sidebarWidth: s.sidebarWidth, sidebarCollapsed: s.sidebarCollapsed };
}
function shallowEqual(a: Picked, b: Picked): boolean {
  return a.tabs === b.tabs && a.activeTabId === b.activeTabId && a.sidebarWidth === b.sidebarWidth && a.sidebarCollapsed === b.sidebarCollapsed;
}
