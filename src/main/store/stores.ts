/**
 * Persistent JSON stores (electron-store 8 → conf 10). Every write goes through
 * `atomically.writeFileSync` (see node_modules/conf/dist/source/index.js:375), so a
 * crash mid-write never truncates a store. This replaces the legacy sync-IPC JSON file.
 */
import Store from 'electron-store';
import type { Schema } from 'electron-store';
import type { ConnectionMeta } from '@shared/types/connection';
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types/settings';
import type { WorkspaceSnapshot } from '@shared/types/workspace';
import type { HistoryEntry } from '@shared/types/history';

export interface ConnectionsFile { version: 1; items: Record<string, ConnectionMeta> }
export interface SettingsFile { version: 1; settings: AppSettings }
export interface WorkspaceFile { version: 1; snapshot: WorkspaceSnapshot | null }
export interface HistoryFile { version: 1; entries: HistoryEntry[] }
/** Values are base64 ciphertext produced by safeStorage; never plaintext. */
export interface VaultFile { version: 1; secrets: Record<string, string> }

export interface Stores {
  connections: Store<ConnectionsFile>;
  settings: Store<SettingsFile>;
  workspace: Store<WorkspaceFile>;
  history: Store<HistoryFile>;
  vault: Store<VaultFile>;
}

export const HISTORY_CAP = 1000;

const versionProp = { version: { type: 'number', const: 1 } } as const;

const connectionsSchema: Schema<ConnectionsFile> = {
  ...versionProp,
  items: { type: 'object', additionalProperties: { type: 'object' } }
};
const settingsSchema: Schema<SettingsFile> = {
  ...versionProp,
  settings: { type: 'object' }
};
const workspaceSchema: Schema<WorkspaceFile> = {
  ...versionProp,
  snapshot: { type: ['object', 'null'] }
};
const historySchema: Schema<HistoryFile> = {
  ...versionProp,
  entries: { type: 'array', items: { type: 'object' } }
};
const vaultSchema: Schema<VaultFile> = {
  ...versionProp,
  secrets: { type: 'object', additionalProperties: { type: 'string' } }
};

export interface StoreOptions {
  /** Absolute directory. Defaults to Electron's userData. Required outside Electron. */
  cwd?: string;
  /** Used by electron-store migrations; defaults to app version. */
  projectVersion?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function make<T extends Record<string, any>>(
  name: string,
  schema: Schema<T>,
  defaults: T,
  opts: StoreOptions
): Store<T> {
  // `projectVersion` is a conf option electron-store forwards but does not declare;
  // outside Electron (unit tests) there is no app version to fall back on.
  const options = {
    name,
    schema,
    defaults,
    clearInvalidConfig: false,
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
    projectVersion: opts.projectVersion ?? '2.0.0',
    migrations: {
      '1.0.0': () => {
        /* version 1: initial shape, nothing to migrate */
      }
    }
  } as ConstructorParameters<typeof Store<T>>[0];
  return new Store<T>(options);
}

/** Build a fresh set of stores. Tests pass a temp `cwd`. */
export function getStores(opts: StoreOptions = {}): Stores {
  return {
    connections: make<ConnectionsFile>('connections', connectionsSchema, { version: 1, items: {} }, opts),
    settings: make<SettingsFile>('settings', settingsSchema, { version: 1, settings: DEFAULT_SETTINGS }, opts),
    workspace: make<WorkspaceFile>('workspace', workspaceSchema, { version: 1, snapshot: null }, opts),
    history: make<HistoryFile>('history', historySchema, { version: 1, entries: [] }, opts),
    vault: make<VaultFile>('vault', vaultSchema, { version: 1, secrets: {} }, opts)
  };
}

let appStores: Stores | null = null;

/** App-wide singleton (userData). Call `initStores` once from main if you need custom options. */
export function stores(): Stores {
  if (!appStores) appStores = getStores();
  return appStores;
}

export function initStores(opts: StoreOptions): Stores {
  appStores = getStores(opts);
  return appStores;
}

/* ---------- typed accessors (operate on a given Stores; default to the app singleton) ---------- */

export function listConnections(s: Stores = stores()): ConnectionMeta[] {
  return Object.values(s.connections.get('items')).sort((a, b) => a.name.localeCompare(b.name));
}

export function getConnection(id: string, s: Stores = stores()): ConnectionMeta | undefined {
  return s.connections.get('items')[id];
}

/** Persists meta. Any `password` property is stripped so it can never reach connections.json. */
export function upsertConnection(meta: ConnectionMeta, s: Stores = stores()): ConnectionMeta {
  const { password: _drop, ...clean } = meta as ConnectionMeta & { password?: unknown };
  void _drop;
  const items = { ...s.connections.get('items'), [clean.id]: clean };
  s.connections.set('items', items);
  return clean;
}

export function removeConnection(id: string, s: Stores = stores()): boolean {
  const items = { ...s.connections.get('items') };
  if (!(id in items)) return false;
  delete items[id];
  s.connections.set('items', items);
  return true;
}

export function getSettings(s: Stores = stores()): AppSettings {
  return { ...DEFAULT_SETTINGS, ...s.settings.get('settings') };
}

export function setSettings(patch: Partial<AppSettings>, s: Stores = stores()): AppSettings {
  const next = { ...getSettings(s), ...patch };
  s.settings.set('settings', next);
  return next;
}

export function loadWorkspace(s: Stores = stores()): WorkspaceSnapshot | null {
  return s.workspace.get('snapshot');
}

export function saveWorkspace(snapshot: WorkspaceSnapshot | null, s: Stores = stores()): void {
  s.workspace.set('snapshot', snapshot);
}

export function listHistory(
  q: { connectionId?: string; search?: string; limit?: number } = {},
  s: Stores = stores()
): HistoryEntry[] {
  const needle = q.search?.toLowerCase();
  return s.history
    .get('entries')
    .filter((e) => (q.connectionId ? e.connectionId === q.connectionId : true))
    .filter((e) => (needle ? e.sql.toLowerCase().includes(needle) : true))
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, q.limit ?? 200);
}

/** Appends and trims to HISTORY_CAP newest entries. */
export function appendHistory(entry: HistoryEntry, s: Stores = stores()): void {
  const entries = [...s.history.get('entries'), entry];
  if (entries.length > HISTORY_CAP) entries.splice(0, entries.length - HISTORY_CAP);
  s.history.set('entries', entries);
}

export function clearHistory(connectionId?: string, s: Stores = stores()): void {
  if (!connectionId) {
    s.history.set('entries', []);
    return;
  }
  s.history.set(
    'entries',
    s.history.get('entries').filter((e) => e.connectionId !== connectionId)
  );
}
