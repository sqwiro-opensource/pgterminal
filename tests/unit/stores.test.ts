import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getStores,
  listConnections,
  upsertConnection,
  removeConnection,
  getSettings,
  setSettings,
  loadWorkspace,
  saveWorkspace,
  listHistory,
  appendHistory,
  clearHistory,
  HISTORY_CAP,
  type Stores
} from '@main/store/stores';
import { DEFAULT_SETTINGS } from '@shared/types/settings';
import type { ConnectionMeta } from '@shared/types/connection';
import type { HistoryEntry } from '@shared/types/history';

function meta(id: string, name = id): ConnectionMeta {
  return {
    id,
    name,
    host: 'localhost',
    port: 5432,
    user: 'pgui',
    defaultDatabase: 'postgres',
    sslMode: 'disable',
    env: 'local',
    readOnly: false,
    poolMax: 4,
    idleTimeoutMs: 30_000,
    statementTimeoutMs: 0,
    connectTimeoutMs: 5_000,
    hasPassword: false,
    createdAt: 1,
    updatedAt: 1
  };
}

function entry(i: number, connectionId = 'c1'): HistoryEntry {
  return { id: `h${i}`, connectionId, database: 'db', sql: `select ${i}`, startedAt: i, durationMs: 1, rowCount: 1, status: 'ok' };
}

describe('stores', () => {
  let cwd: string;
  let s: Stores;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'pgui-stores-'));
    s = getStores({ cwd });
  });

  it('creates the five files under cwd with default shapes', () => {
    for (const name of ['connections', 'settings', 'workspace', 'history', 'vault']) {
      // conf writes lazily on first get/set; touch each store
      (s as unknown as Record<string, { get(k: string): unknown }>)[name]!.get('version');
    }
    s.connections.set('version', 1);
    s.settings.set('version', 1);
    s.workspace.set('version', 1);
    s.history.set('version', 1);
    s.vault.set('version', 1);
    // conf adds an __internal__.migrations marker alongside our shape
    const read = (f: string): Record<string, unknown> => {
      const { __internal__: _i, ...rest } = JSON.parse(readFileSync(join(cwd, f), 'utf8'));
      void _i;
      return rest;
    };
    expect(read('connections.json')).toEqual({ version: 1, items: {} });
    expect(read('settings.json')).toEqual({ version: 1, settings: DEFAULT_SETTINGS });
    expect(read('workspace.json')).toEqual({ version: 1, snapshot: null });
    expect(read('history.json')).toEqual({ version: 1, entries: [] });
    expect(read('vault.json')).toEqual({ version: 1, secrets: {} });
  });

  it('upsert / list / remove connections round-trip and survive re-open', () => {
    upsertConnection(meta('b', 'beta'), s);
    upsertConnection(meta('a', 'alpha'), s);
    expect(listConnections(s).map((c) => c.name)).toEqual(['alpha', 'beta']);
    upsertConnection({ ...meta('a', 'alpha2') }, s);
    expect(listConnections(s).map((c) => c.name)).toEqual(['alpha2', 'beta']);
    expect(removeConnection('b', s)).toBe(true);
    expect(removeConnection('b', s)).toBe(false);
    const reopened = getStores({ cwd });
    expect(listConnections(reopened).map((c) => c.id)).toEqual(['a']);
  });

  it('never persists a password key even if one is passed', () => {
    upsertConnection({ ...meta('x'), password: 's3cret' } as ConnectionMeta, s);
    const raw = readFileSync(join(cwd, 'connections.json'), 'utf8');
    expect(raw).not.toContain('password');
    expect(raw).not.toContain('s3cret');
    expect(getSettings(s)).toEqual(DEFAULT_SETTINGS);
  });

  it('settings merge keeps defaults', () => {
    const next = setSettings({ gridPageSize: 500, theme: 'dark' }, s);
    expect(next.gridPageSize).toBe(500);
    expect(next.theme).toBe('dark');
    expect(next.queryRowCap).toBe(DEFAULT_SETTINGS.queryRowCap);
    expect(getSettings(getStores({ cwd })).gridPageSize).toBe(500);
  });

  it('workspace snapshot round-trips', () => {
    expect(loadWorkspace(s)).toBeNull();
    const snap = { version: 1 as const, tabs: [], activeTabId: null, sidebar: { width: 280, expandedNodeIds: [], activeConnectionId: null } };
    saveWorkspace(snap, s);
    expect(loadWorkspace(getStores({ cwd }))).toEqual(snap);
  });

  it('history appends newest-first, filters, and caps at HISTORY_CAP', () => {
    for (let i = 0; i < HISTORY_CAP + 25; i++) appendHistory(entry(i, i % 2 ? 'c1' : 'c2'), s);
    const all = s.history.get('entries');
    expect(all.length).toBe(HISTORY_CAP);
    expect(all[0]!.id).toBe('h25');
    expect(listHistory({ limit: 3 }, s).map((e) => e.id)).toEqual(['h1024', 'h1023', 'h1022']);
    expect(listHistory({ connectionId: 'c2', limit: 2 }, s).every((e) => e.connectionId === 'c2')).toBe(true);
    expect(listHistory({ search: 'SELECT 1000', limit: 5 }, s).map((e) => e.id)).toEqual(['h1000']);
    clearHistory('c2', s);
    expect(s.history.get('entries').every((e) => e.connectionId === 'c1')).toBe(true);
    clearHistory(undefined, s);
    expect(s.history.get('entries')).toEqual([]);
    expect(existsSync(join(cwd, 'history.json'))).toBe(true);
  });
});
