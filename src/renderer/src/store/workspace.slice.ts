import type { Tab, TabKind, TabParamsByKind, WorkspaceSnapshot } from '@shared/ipc';
import { defaultTitle, tabConnectionId, tabId } from '@shared/workspace/tabId';
import { getPgui } from '../lib/ipc';
import type { RootState, SliceCreator } from './index';

export interface OpenTabOptions {
  title?: string;
  /** Activate the tab (default true). */
  focus?: boolean;
  /** Focus an existing tab with the same id instead of duplicating (default true). */
  reuse?: boolean;
  /** Insert after this tab id (default: at the end). */
  after?: string;
}

export interface WorkspaceSlice {
  tabs: Tab[];
  activeTabId: string | null;
  recentlyClosed: Tab[];
  workspaceLoaded: boolean;
  openTab<K extends TabKind>(kind: K, params: TabParamsByKind[K], opts?: OpenTabOptions): string;
  /** Closes a tab; when a close guard is registered it is awaited first unless `force` is set. */
  closeTab(id: string, opts?: { force?: boolean }): void;
  closeOthers(id: string): void;
  closeRight(id: string): void;
  closeAll(): void;
  setActive(id: string): void;
  activateOffset(delta: number): void;
  activateIndex(i: number): void;
  updateParams<K extends TabKind>(id: string, patch: Partial<TabParamsByKind[K]>): void;
  setTitle(id: string, title: string): void;
  setDirty(id: string, dirty: boolean): void;
  reorder(from: number, to: number): void;
  togglePin(id: string): void;
  reopenClosed(): void;
  loadWorkspace(): Promise<void>;
}

const RECENTLY_CLOSED_CAP = 20;

/** Pinned tabs first (stable within each group). */
function sortPinned(tabs: Tab[]): Tab[] {
  const pinned = tabs.filter((t) => t.pinned);
  const rest = tabs.filter((t) => !t.pinned);
  return [...pinned, ...rest];
}

/** Neighbour to activate after closing `index`: right first, then left. */
function neighbourAfterClose(tabs: Tab[], index: number): string | null {
  const right = tabs[index + 1];
  if (right) return right.id;
  const left = tabs[index - 1];
  if (left) return left.id;
  return null;
}

function pushClosed(recentlyClosed: Tab[], closed: Tab[]): Tab[] {
  return [...closed.slice().reverse(), ...recentlyClosed].slice(0, RECENTLY_CLOSED_CAP);
}

/** Connection id of the active tab's params, if any. */
export function activeConnectionId(state: RootState): string | null {
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  return tab ? tabConnectionId(tab) : null;
}

export function isValidSnapshot(v: unknown): v is WorkspaceSnapshot {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<WorkspaceSnapshot>;
  return s.version === 1 && Array.isArray(s.tabs);
}

export const createWorkspaceSlice: SliceCreator<WorkspaceSlice> = (set, get) => ({
  tabs: [],
  activeTabId: null,
  recentlyClosed: [],
  workspaceLoaded: false,

  openTab(kind, params, opts = {}) {
    const { focus = true, reuse = true } = opts;
    const id = tabId(kind, params);
    const existing = get().tabs.find((t) => t.id === id);
    if (existing && reuse) {
      if (focus) set({ activeTabId: id });
      return id;
    }
    const tab: Tab = {
      id,
      kind,
      title: opts.title ?? defaultTitle(kind, params),
      params,
      dirty: false,
      pinned: false,
      createdAt: Date.now()
    };
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id);
      let at = tabs.length;
      if (opts.after) {
        const i = tabs.findIndex((t) => t.id === opts.after);
        if (i >= 0) at = i + 1;
      }
      tabs.splice(at, 0, tab);
      return { tabs: sortPinned(tabs), activeTabId: focus ? id : s.activeTabId };
    });
    return id;
  },

  closeTab(id, opts = {}) {
    const guard = get().closeGuards?.[id];
    if (guard && !opts.force) {
      void guard().then((ok) => {
        if (ok) get().closeTab(id, { force: true });
      });
      return;
    }
    get().registerCloseGuard?.(id, null);
    set((s) => {
      const index = s.tabs.findIndex((t) => t.id === id);
      if (index < 0) return {};
      const closed = s.tabs[index]!;
      const tabs = s.tabs.filter((t) => t.id !== id);
      const activeTabId = s.activeTabId === id ? neighbourAfterClose(s.tabs, index) : s.activeTabId;
      return { tabs, activeTabId, recentlyClosed: pushClosed(s.recentlyClosed, [closed]) };
    });
    get().clearTabRuntime?.(id);
  },

  closeOthers(id) {
    set((s) => {
      const keep = s.tabs.filter((t) => t.id === id || t.pinned);
      const closed = s.tabs.filter((t) => !(t.id === id || t.pinned));
      if (closed.length === 0) return {};
      return { tabs: keep, activeTabId: id, recentlyClosed: pushClosed(s.recentlyClosed, closed) };
    });
  },

  closeRight(id) {
    set((s) => {
      const index = s.tabs.findIndex((t) => t.id === id);
      if (index < 0) return {};
      const closed = s.tabs.slice(index + 1).filter((t) => !t.pinned);
      if (closed.length === 0) return {};
      const closedIds = new Set(closed.map((t) => t.id));
      const tabs = s.tabs.filter((t) => !closedIds.has(t.id));
      const activeTabId = s.activeTabId && closedIds.has(s.activeTabId) ? id : s.activeTabId;
      return { tabs, activeTabId, recentlyClosed: pushClosed(s.recentlyClosed, closed) };
    });
  },

  closeAll() {
    set((s) => {
      const keep = s.tabs.filter((t) => t.pinned);
      const closed = s.tabs.filter((t) => !t.pinned);
      if (closed.length === 0) return {};
      const activeTabId = keep.some((t) => t.id === s.activeTabId) ? s.activeTabId : (keep[0]?.id ?? null);
      return { tabs: keep, activeTabId, recentlyClosed: pushClosed(s.recentlyClosed, closed) };
    });
  },

  setActive(id) {
    if (get().tabs.some((t) => t.id === id)) set({ activeTabId: id });
  },

  activateOffset(delta) {
    const { tabs, activeTabId } = get();
    if (tabs.length === 0) return;
    const i = Math.max(0, tabs.findIndex((t) => t.id === activeTabId));
    const n = tabs.length;
    const next = (((i + delta) % n) + n) % n;
    set({ activeTabId: tabs[next]!.id });
  },

  activateIndex(i) {
    const { tabs } = get();
    const tab = i === 8 ? tabs[tabs.length - 1] : tabs[i];
    if (tab) set({ activeTabId: tab.id });
  },

  updateParams(id, patch) {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, params: { ...t.params, ...patch } } : t))
    }));
  },

  setTitle(id, title) {
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)) }));
  },

  setDirty(id, dirty) {
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id && t.dirty !== dirty ? { ...t, dirty } : t)) }));
  },

  reorder(from, to) {
    set((s) => {
      if (from === to || from < 0 || from >= s.tabs.length) return {};
      const tabs = s.tabs.slice();
      const [moved] = tabs.splice(from, 1);
      if (!moved) return {};
      tabs.splice(Math.max(0, Math.min(to, tabs.length)), 0, moved);
      return { tabs: sortPinned(tabs) };
    });
  },

  togglePin(id) {
    set((s) => ({ tabs: sortPinned(s.tabs.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t))) }));
  },

  reopenClosed() {
    const [tab, ...rest] = get().recentlyClosed;
    if (!tab) return;
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== tab.id);
      return { tabs: sortPinned([...tabs, { ...tab, dirty: false }]), activeTabId: tab.id, recentlyClosed: rest };
    });
  },

  async loadWorkspace() {
    try {
      const snapshot = await getPgui()['workspace:load']();
      if (isValidSnapshot(snapshot)) {
        const tabs = sortPinned(snapshot.tabs.filter((t) => t && typeof t.id === 'string' && typeof t.kind === 'string'));
        const activeTabId = tabs.some((t) => t.id === snapshot.activeTabId) ? snapshot.activeTabId : (tabs[0]?.id ?? null);
        set({ tabs, activeTabId });
        if (typeof snapshot.sidebar?.width === 'number') get().setSidebarWidth?.(snapshot.sidebar.width);
      }
    } finally {
      set({ workspaceLoaded: true });
    }
  }
});
