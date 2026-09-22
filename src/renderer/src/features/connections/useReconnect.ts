import { useEffect } from 'react';
import { toast } from 'sonner';
import { setIpcErrorObserver, setIpcSuccessObserver } from '@renderer/lib/ipc';
import { isConnectionLost, useStore } from '@renderer/store';

/** Event the active tab listens for to reload itself after a successful reconnect. */
export const REFRESH_TAB_EVENT = 'pgterminal:refresh-tab';

/** Asks whichever tab is mounted to reload its data. */
export function requestTabRefresh(connectionId: string): void {
  window.dispatchEvent(new CustomEvent(REFRESH_TAB_EVENT, { detail: { connectionId } }));
}

/** Channels whose failures never mean the server is gone (they run before/without a pool). */
const IGNORED_CHANNELS = new Set([
  'connections:test',
  'connections:connect',
  'connections:disconnect',
  'connections:save',
  'connections:delete',
  'connections:list',
  'settings:get',
  'settings:set',
  'workspace:load',
  'workspace:save',
  'app:info'
]);

/** Reconnects at most once per burst of failures. */
let lastAttemptAt = new Map<string, number>();
const RETRY_COOLDOWN_MS = 4000;

async function attemptReconnect(connectionId: string): Promise<void> {
  const now = Date.now();
  const last = lastAttemptAt.get(connectionId) ?? 0;
  if (now - last < RETRY_COOLDOWN_MS) return;
  lastAttemptAt.set(connectionId, now);

  const state = useStore.getState();
  const meta = state.connections[connectionId];
  const status = state.status[connectionId];
  if (!meta || !status || status.state !== 'connected' || status.reconnecting) return;
  // Without a stored password main cannot re-authenticate silently.
  if (!meta.hasPassword) {
    state.markPoolError(connectionId, { message: 'Connection lost. Reconnect to enter the password again.' });
    return;
  }

  const ok = await state.reconnect(connectionId);
  if (ok) {
    toast.success(`Reconnected to ${meta.name}`);
    requestTabRefresh(connectionId);
  } else {
    const err = useStore.getState().status[connectionId]?.error;
    toast.error(`Lost connection to ${meta.name}`, {
      description: err?.message,
      duration: Infinity,
      action: { label: 'Edit connection', onClick: () => useStore.getState().openConnectionsView(connectionId) }
    });
  }
}

/**
 * Watches every IPC rejection: when one looks like a dropped server connection, marks the
 * connection degraded and tries a single lazy reconnect. Mounted once from the shell.
 */
export function useReconnect(): void {
  useEffect(() => {
    lastAttemptAt = new Map();
    return setIpcErrorObserver(({ channel, connectionId, error }) => {
      if (!connectionId || IGNORED_CHANNELS.has(channel)) return;
      if (!isConnectionLost(error)) return;
      const s = useStore.getState();
      if (s.status[connectionId]?.state !== 'connected') return;
      s.markPoolError(connectionId, {
        message: error instanceof Error ? error.message : String(error),
        hint: 'The server connection dropped; reconnecting.'
      });
      void attemptReconnect(connectionId);
    });
  }, []);

  // A pg Pool replaces a dead client on its own, so a later success may arrive without any
  // explicit reconnect. Clear the warning when that happens, otherwise the chip never goes away.
  useEffect(() => {
    return setIpcSuccessObserver(({ channel, connectionId }) => {
      if (!connectionId || IGNORED_CHANNELS.has(channel)) return;
      const st = useStore.getState().status[connectionId];
      if (st?.degraded) useStore.getState().clearDegraded(connectionId);
    });
  }, []);
}

/** Manual reconnect used by the status-bar chip and the tree. */
export function reconnectNow(connectionId: string): void {
  lastAttemptAt.delete(connectionId);
  void attemptReconnect(connectionId);
}

/** Subscribes a tab to post-reconnect refreshes for its own connection. */
export function useTabRefresh(connectionId: string | undefined, onRefresh: () => void): void {
  useEffect(() => {
    if (!connectionId) return;
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<{ connectionId: string }>).detail;
      if (detail?.connectionId === connectionId) onRefresh();
    };
    window.addEventListener(REFRESH_TAB_EVENT, handler);
    return () => window.removeEventListener(REFRESH_TAB_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, onRefresh]);
}
