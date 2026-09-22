import type { SliceCreator } from './index';

export interface UiSlice {
  /** Connection selected for editing in the Connections tab; null = new/none. */
  editingConnectionId: string | null;
  /** Opens (or focuses) the Connections tab, optionally selecting a connection to edit. */
  openConnectionsView(editId?: string | null): void;
  sidebarFilter: string;
  setSidebarFilter(v: string): void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed(v: boolean): void;
  /** Sidebar width in percent of the panel group (persisted). */
  sidebarWidth: number;
  setSidebarWidth(v: number): void;
  inspectorVisible: boolean;
  setInspectorVisible(v: boolean): void;
  /** Transient per-tab runtime (result sets, edit buffers, scroll). Never persisted. */
  tabRuntime: Record<string, unknown>;
  setTabRuntime(id: string, patch: unknown): void;
  clearTabRuntime(id: string): void;
  /** Per-tab close guards: resolve false to keep the tab open (e.g. pending edits). */
  closeGuards: Record<string, () => Promise<boolean>>;
  registerCloseGuard(id: string, fn: (() => Promise<boolean>) | null): void;
}

export const createUiSlice: SliceCreator<UiSlice> = (set, get) => ({
  editingConnectionId: null,
  openConnectionsView(editId = null) {
    set({ editingConnectionId: editId });
    get().openTab('connections', {});
  },
  sidebarFilter: '',
  setSidebarFilter(v) {
    set({ sidebarFilter: v });
  },
  sidebarCollapsed: false,
  setSidebarCollapsed(v) {
    set({ sidebarCollapsed: v });
  },
  sidebarWidth: 20,
  setSidebarWidth(v) {
    if (Number.isFinite(v) && v > 0) set({ sidebarWidth: v });
  },
  inspectorVisible: false,
  setInspectorVisible(v) {
    set({ inspectorVisible: v });
  },
  tabRuntime: {},
  setTabRuntime(id, patch) {
    set((s) => {
      const prev = s.tabRuntime[id];
      const next =
        patch && typeof patch === 'object' && prev && typeof prev === 'object'
          ? { ...(prev as object), ...(patch as object) }
          : patch;
      return { tabRuntime: { ...s.tabRuntime, [id]: next } };
    });
  },
  clearTabRuntime(id) {
    set((s) => {
      if (!(id in s.tabRuntime)) return {};
      const tabRuntime = { ...s.tabRuntime };
      delete tabRuntime[id];
      return { tabRuntime };
    });
  },
  closeGuards: {},
  registerCloseGuard(id, fn) {
    set((s) => {
      const closeGuards = { ...s.closeGuards };
      if (fn) closeGuards[id] = fn;
      else delete closeGuards[id];
      return { closeGuards };
    });
  }
});
