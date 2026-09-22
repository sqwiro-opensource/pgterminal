import type {
  ConnectionInput,
  ConnectionMeta,
  DatabaseInfo,
  PgErrorInfo,
  ServerInfo,
  TestResult
} from '@shared/ipc';
import { getPgui } from '../lib/ipc';
import type { SliceCreator } from './index';

/** Runtime state of one saved connection (never persisted). */
export interface ConnectionStatus {
  state: 'idle' | 'connecting' | 'connected' | 'error';
  server?: ServerInfo;
  databases?: DatabaseInfo[];
  searchPath?: string[];
  /** Databases with an open pool / expanded tree node. */
  openDatabases: string[];
  error?: PgErrorInfo;
  /** A pool error arrived but the connection is still usable; a reconnect may be needed. */
  degraded?: boolean;
  /** True while a lazy reconnect is in flight. */
  reconnecting?: boolean;
}

export interface ConnectionsSlice {
  connections: Record<string, ConnectionMeta>;
  connectionsLoaded: boolean;
  status: Record<string, ConnectionStatus>;
  loadConnections(): Promise<void>;
  saveConnection(input: ConnectionInput): Promise<ConnectionMeta>;
  deleteConnection(id: string): Promise<void>;
  testConnection(input: ConnectionInput | { connectionId: string }): Promise<TestResult>;
  connect(id: string, password?: string): Promise<void>;
  disconnect(id: string): Promise<void>;
  openDatabase(id: string, database: string): void;
  closeDatabase(id: string, database: string): void;
  /** Marks a pool error pushed by main on the connection status. */
  /** Clears the degraded warning once calls succeed again. */
  clearDegraded(id: string): void;
  markPoolError(id: string, error: PgErrorInfo | undefined): void;
  /**
   * Re-opens a connection whose backend went away, keeping the tab layout intact.
   * At most one attempt runs at a time; concurrent callers await the same promise.
   */
  reconnect(id: string): Promise<boolean>;
}

/** SQLSTATE and socket codes that mean the server connection is gone. */
const CONNECTION_LOST = [
  '57P01',
  '57P02',
  '57P03',
  '08006',
  '08003',
  '08001',
  '08004',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EPIPE'
];

/** True when an IPC failure looks like the server connection dropped rather than a query error. */
export function isConnectionLost(err: unknown): boolean {
  const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code?: unknown }).code) : '';
  if (code && CONNECTION_LOST.includes(code)) return true;
  const message =
    typeof err === 'string'
      ? err
      : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message?: unknown }).message)
        : '';
  if (!message) return false;
  if (CONNECTION_LOST.some((c) => message.includes(c))) return true;
  return /connection terminated|server closed the connection|Connection terminated unexpectedly|terminating connection/i.test(message);
}

const IDLE: ConnectionStatus = { state: 'idle', openDatabases: [] };

/** One reconnect attempt per connection at a time; later callers await the first. */
const inFlightReconnects = new Map<string, Promise<boolean>>();

export function toPgError(err: unknown): PgErrorInfo {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return { message: String((err as { message: unknown }).message) };
  }
  return { message: String(err) };
}

export const createConnectionsSlice: SliceCreator<ConnectionsSlice> = (set, get) => ({
  connections: {},
  connectionsLoaded: false,
  status: {},

  async loadConnections() {
    const list = await getPgui()['connections:list']();
    const connections: Record<string, ConnectionMeta> = {};
    for (const c of list) connections[c.id] = c;
    set({ connections, connectionsLoaded: true });
  },

  async saveConnection(input) {
    const meta = await getPgui()['connections:save'](input);
    set((s) => ({ connections: { ...s.connections, [meta.id]: meta } }));
    return meta;
  },

  async deleteConnection(id) {
    const st = get().status[id];
    if (st && st.state === 'connected') {
      try {
        await getPgui()['connections:disconnect']({ connectionId: id });
      } catch {
        /* best effort */
      }
    }
    await getPgui()['connections:delete']({ connectionId: id });
    set((s) => {
      const connections = { ...s.connections };
      const status = { ...s.status };
      delete connections[id];
      delete status[id];
      return { connections, status };
    });
  },

  testConnection(input) {
    return getPgui()['connections:test'](input);
  },

  async connect(id, password) {
    const meta = get().connections[id];
    if (!meta) throw new Error(`Unknown connection ${id}`);
    set((s) => ({ status: { ...s.status, [id]: { ...IDLE, state: 'connecting' } } }));
    try {
      const res = await getPgui()['connections:connect']({ connectionId: id, password });
      set((s) => ({
        status: {
          ...s.status,
          [id]: {
            state: 'connected',
            server: res.server,
            databases: res.databases,
            searchPath: res.searchPath,
            openDatabases: [meta.defaultDatabase]
          }
        }
      }));
    } catch (err) {
      set((s) => ({ status: { ...s.status, [id]: { ...IDLE, state: 'error', error: toPgError(err) } } }));
      throw err;
    }
  },

  async disconnect(id) {
    try {
      await getPgui()['connections:disconnect']({ connectionId: id });
    } finally {
      set((s) => ({ status: { ...s.status, [id]: { ...IDLE } } }));
    }
  },

  openDatabase(id, database) {
    set((s) => {
      const st = s.status[id] ?? IDLE;
      if (st.openDatabases.includes(database)) return {};
      return { status: { ...s.status, [id]: { ...st, openDatabases: [...st.openDatabases, database] } } };
    });
  },

  closeDatabase(id, database) {
    set((s) => {
      const st = s.status[id] ?? IDLE;
      return {
        status: { ...s.status, [id]: { ...st, openDatabases: st.openDatabases.filter((d) => d !== database) } }
      };
    });
  },

  markPoolError(id, error) {
    set((s) => {
      const st = s.status[id] ?? IDLE;
      // Keep `connected` so open tabs stay mounted; `degraded` drives the status-bar warning.
      return { status: { ...s.status, [id]: { ...st, error, degraded: error !== undefined } } };
    });
  },

  clearDegraded(id) {
    set((s) => {
      const st = s.status[id];
      if (!st?.degraded) return s;
      const next = { ...st, degraded: false };
      delete (next as { error?: unknown }).error;
      return { status: { ...s.status, [id]: next } };
    });
  },

  async reconnect(id) {
    const existing = inFlightReconnects.get(id);
    if (existing) return existing;
    const meta = get().connections[id];
    if (!meta) return false;
    const attempt = (async (): Promise<boolean> => {
      const previous = get().status[id];
      set((s) => ({ status: { ...s.status, [id]: { ...(s.status[id] ?? IDLE), reconnecting: true } } }));
      try {
        const res = await getPgui()['connections:connect']({ connectionId: id });
        set((s) => ({
          status: {
            ...s.status,
            [id]: {
              state: 'connected',
              server: res.server,
              databases: res.databases,
              searchPath: res.searchPath,
              // Keep whatever the user had open so the tree does not collapse.
              openDatabases: previous?.openDatabases?.length ? previous.openDatabases : [meta.defaultDatabase],
              degraded: false,
              reconnecting: false,
              error: undefined
            }
          }
        }));
        return true;
      } catch (err) {
        set((s) => ({
          status: {
            ...s.status,
            [id]: { ...(s.status[id] ?? IDLE), reconnecting: false, degraded: true, error: toPgError(err) }
          }
        }));
        return false;
      } finally {
        inFlightReconnects.delete(id);
      }
    })();
    inFlightReconnects.set(id, attempt);
    return attempt;
  }
});
