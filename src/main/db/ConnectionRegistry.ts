import type { Pool } from 'pg';
import type { ConnectionEvent, ConnectionMeta } from '@shared/ipc';
import { createPool } from './poolFactory';
import { toPgErrorInfo } from './pgError';
import { push } from '../ipc/handle';
import { onShutdown } from '../lifecycle';

interface Entry {
  meta: ConnectionMeta;
  password?: string;
  pools: Map<string, Pool>;
  lastUsed: Map<string, number>;
}

export interface RegistryOptions {
  /** Where pool-level events go. Defaults to the IPC push channel, loaded lazily. */
  emit?: (e: ConnectionEvent) => void;
  /** Pools idle longer than this (ms) on non-default databases are ended by the reaper. */
  idlePoolMs?: number;
  /** Reaper period in ms. */
  reaperIntervalMs?: number;
  /** Upper bound for each pool.end() during closeAll. */
  closeTimeoutMs?: number;
}

function defaultEmit(e: ConnectionEvent): void {
  try {
    push('connections:event', e);
  } catch {
    // no window / not running under electron (tests)
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(undefined), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(undefined);
      }
    );
  });
}

/**
 * Owns every pg Pool in the app, keyed by (connectionId, database). Pools are created lazily,
 * carry a mandatory error handler, are reaped when idle, and are closed on quit.
 */
export class ConnectionRegistry {
  private readonly entries = new Map<string, Entry>();
  private readonly emit: (e: ConnectionEvent) => void;
  private readonly idlePoolMs: number;
  private readonly closeTimeoutMs: number;
  private reaper: NodeJS.Timeout | null = null;

  constructor(opts: RegistryOptions = {}) {
    this.emit = opts.emit ?? defaultEmit;
    this.idlePoolMs = opts.idlePoolMs ?? 10 * 60 * 1000;
    this.closeTimeoutMs = opts.closeTimeoutMs ?? 2000;
    const period = opts.reaperIntervalMs ?? 60 * 1000;
    if (period > 0) {
      this.reaper = setInterval(() => void this.reapIdle(), period);
      this.reaper.unref();
    }
  }

  /** Register (or replace) a connection's metadata and optional password. */
  register(meta: ConnectionMeta, password?: string): void {
    const existing = this.entries.get(meta.id);
    if (existing) {
      existing.meta = meta;
      if (password !== undefined) existing.password = password;
      return;
    }
    const entry: Entry = { meta, pools: new Map(), lastUsed: new Map() };
    if (password !== undefined) entry.password = password;
    this.entries.set(meta.id, entry);
  }

  /** Update metadata without touching the password. */
  updateMeta(meta: ConnectionMeta): void {
    const e = this.entries.get(meta.id);
    if (e) e.meta = meta;
    else this.register(meta);
  }

  /** Forget a connection after ending its pools. */
  async unregister(connectionId: string): Promise<void> {
    await this.disconnect(connectionId);
    this.entries.delete(connectionId);
  }

  has(connectionId: string): boolean {
    return this.entries.has(connectionId);
  }

  getMeta(connectionId: string): ConnectionMeta | undefined {
    return this.entries.get(connectionId)?.meta;
  }

  /** Databases that currently have an open pool for this connection. */
  listDatabasesWithPools(connectionId: string): string[] {
    return [...(this.entries.get(connectionId)?.pools.keys() ?? [])];
  }

  /** Get or lazily create the pool for (connection, database). */
  getPool(connectionId: string, database: string): Pool {
    const entry = this.entries.get(connectionId);
    if (!entry) throw new Error(`Unknown connection: ${connectionId}`);
    let pool = entry.pools.get(database);
    if (!pool) {
      pool = createPool(entry.meta, database, entry.password);
      pool.on('error', (err) => {
        try {
          this.emit({ connectionId, type: 'poolError', error: toPgErrorInfo(err) });
        } catch {
          // never let an emitter failure surface as an unhandled error
        }
      });
      entry.pools.set(database, pool);
    }
    entry.lastUsed.set(database, Date.now());
    return pool;
  }

  /** Mark a pool as recently used (called by long operations). */
  touch(connectionId: string, database: string): void {
    this.entries.get(connectionId)?.lastUsed.set(database, Date.now());
  }

  /** End every pool of one connection. Resolves even if some pools fail to end. */
  async disconnect(connectionId: string): Promise<void> {
    const entry = this.entries.get(connectionId);
    if (!entry) return;
    const pools = [...entry.pools.values()];
    entry.pools.clear();
    entry.lastUsed.clear();
    await Promise.allSettled(pools.map((p) => withTimeout(p.end(), this.closeTimeoutMs)));
    try {
      this.emit({ connectionId, type: 'disconnected' });
    } catch {
      // ignore
    }
  }

  /** End every pool in the registry, each bounded by the close timeout. */
  async closeAll(): Promise<void> {
    const jobs: Promise<unknown>[] = [];
    for (const entry of this.entries.values()) {
      for (const pool of entry.pools.values()) jobs.push(withTimeout(pool.end(), this.closeTimeoutMs));
      entry.pools.clear();
      entry.lastUsed.clear();
    }
    await Promise.allSettled(jobs);
    if (this.reaper) {
      clearInterval(this.reaper);
      this.reaper = null;
    }
  }

  /** End pools that have been idle too long on databases other than the default one. */
  async reapIdle(now = Date.now()): Promise<void> {
    for (const [connectionId, entry] of this.entries) {
      for (const [database, pool] of entry.pools) {
        if (database === entry.meta.defaultDatabase) continue;
        const last = entry.lastUsed.get(database) ?? 0;
        if (now - last < this.idlePoolMs) continue;
        if (pool.totalCount > pool.idleCount) continue; // a client is checked out
        entry.pools.delete(database);
        entry.lastUsed.delete(database);
        await withTimeout(pool.end(), this.closeTimeoutMs);
        void connectionId;
      }
    }
  }
}

/** The app-wide registry. */
export const registry = new ConnectionRegistry();

/** Register `registry.closeAll()` with the app lifecycle. Call once from main. */
export function installShutdownHook(): void {
  onShutdown(() => registry.closeAll());
}
