import { useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Tab, TabKind } from '@shared/ipc';
import { useStore } from '../store';
import { REFRESH_TAB_EVENT } from '../lib/keybindings';

/** Selects one tab by id, typed by kind. Throws if the tab is gone (callers only render mounted tabs). */
export function useTab<K extends TabKind>(id: string): Tab<K> {
  const tab = useStore((s) => s.tabs.find((t) => t.id === id));
  if (!tab) throw new Error(`tab ${id} is not open`);
  return tab as Tab<K>;
}

/** Transient runtime state for a tab (never persisted). `init` is used until the first write. */
export function useTabRuntime<T>(id: string, init: T): [T, (patch: Partial<T>) => void] {
  const { value, setTabRuntime } = useStore(
    useShallow((s) => ({ value: s.tabRuntime[id] as T | undefined, setTabRuntime: s.setTabRuntime }))
  );
  const update = useCallback(
    (patch: Partial<T>) => {
      const current = (useStore.getState().tabRuntime[id] as T | undefined) ?? init;
      setTabRuntime(id, { ...current, ...patch });
    },
    [id, init, setTabRuntime]
  );
  return [value ?? init, update];
}

/**
 * Runs `fn` when the user asks this tab to reload (⌘R / F5, or `requestTabRefresh(tabId)`).
 * The latest callback is used, so callers need not memoise.
 */
export function useRefreshSignal(id: string, fn: () => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const onRefresh = (e: Event): void => {
      const detail = (e as CustomEvent<{ tabId?: string }>).detail;
      if (detail?.tabId === id) ref.current();
    };
    window.addEventListener(REFRESH_TAB_EVENT, onRefresh);
    return () => window.removeEventListener(REFRESH_TAB_EVENT, onRefresh);
  }, [id]);
}
