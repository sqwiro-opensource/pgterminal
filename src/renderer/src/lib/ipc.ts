import { useEffect, useRef } from 'react';
import type { IpcPushMap, PgTerminalApi } from '@shared/ipc';

/** Observer notified of every rejected invoke, so connection loss can trigger a lazy reconnect. */
export type IpcErrorObserver = (info: { channel: string; connectionId?: string; error: unknown }) => void;

/** Observer notified of every successful invoke, so a self-healed pool can clear its warning. */
export type IpcSuccessObserver = (info: { channel: string; connectionId?: string }) => void;

let ipcSuccessObserver: IpcSuccessObserver | null = null;

/** Installs (or clears) the single IPC success observer. Returns a disposer. */
export function setIpcSuccessObserver(fn: IpcSuccessObserver | null): () => void {
  ipcSuccessObserver = fn;
  return () => {
    if (ipcSuccessObserver === fn) ipcSuccessObserver = null;
  };
}

let ipcErrorObserver: IpcErrorObserver | null = null;

/** Installs (or clears) the single IPC error observer. Returns a disposer. */
export function setIpcErrorObserver(fn: IpcErrorObserver | null): () => void {
  ipcErrorObserver = fn;
  return () => {
    if (ipcErrorObserver === fn) ipcErrorObserver = null;
  };
}

function connectionIdOf(req: unknown): string | undefined {
  if (typeof req === 'object' && req !== null && 'connectionId' in req) {
    const id = (req as { connectionId?: unknown }).connectionId;
    if (typeof id === 'string' && id !== 'all') return id;
  }
  return undefined;
}

let wrapped: PgTerminalApi | null = null;
let wrappedFor: PgTerminalApi | null = null;

/**
 * Wraps the preload API so every rejected invoke is reported to the observer before the
 * rejection reaches the caller. `on` and non-function members pass through untouched.
 *
 * This builds a plain object rather than a Proxy: contextBridge exposes `window.pgterminal` with
 * non-configurable, non-writable properties, and a Proxy `get` trap must return those values
 * unchanged — returning a wrapper violates the invariant and throws at the first call.
 */
function wrapApi(api: PgTerminalApi): PgTerminalApi {
  if (wrapped && wrappedFor === api) return wrapped;
  const out = {} as Record<string, unknown>;
  for (const key of Reflect.ownKeys(api) as Array<keyof PgTerminalApi & string>) {
    const value = api[key] as unknown;
    if (typeof value !== 'function' || key === 'on') {
      out[key] = typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(api) : value;
      continue;
    }
    const channel = key;
    const fn = (value as (...args: unknown[]) => unknown).bind(api);
    out[channel] = (...args: unknown[]): unknown => {
      const res = fn(...args);
      if (res instanceof Promise) {
        return res.then(
          (value: unknown) => {
            ipcSuccessObserver?.({ channel, connectionId: connectionIdOf(args[0]) });
            return value;
          },
          (error: unknown) => {
            ipcErrorObserver?.({ channel, connectionId: connectionIdOf(args[0]), error });
            throw error;
          }
        );
      }
      return res;
    };
  }
  wrapped = out as unknown as PgTerminalApi;
  wrappedFor = api;
  return wrapped;
}

/** Typed accessor for the preload-exposed API. Throws a clear error when the preload did not run. */
export function getApi(): PgTerminalApi {
  const api = (window as unknown as { pgterminal?: PgTerminalApi }).pgterminal;
  if (!api) {
    throw new Error(
      'window.pgterminal is undefined: the preload script did not expose the API (check contextIsolation/sandbox and the preload path).'
    );
  }
  return wrapApi(api);
}

/** Lazy proxy so modules can import `pgterminal` at top level without crashing when the preload is missing. */
export const pgterminal: PgTerminalApi = new Proxy({} as PgTerminalApi, {
  get(_target, prop) {
    return getApi()[prop as keyof PgTerminalApi];
  }
});

/** Subscribes to a push channel for the lifetime of the component; the latest callback is always used. */
export function useIpcEvent<K extends keyof IpcPushMap>(
  channel: K,
  cb: (payload: IpcPushMap[K]) => void
): void {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = getApi().on(channel, (payload) => cbRef.current(payload));
    } catch (err) {
      console.warn(`useIpcEvent(${channel}): ${(err as Error).message}`);
    }
    return () => unsubscribe?.();
  }, [channel]);
}
