/**
 * connections:* IPC handlers. The pure implementations live in `createConnectionsHandlers`
 * (dependencies injected) so integration tests can drive them without Electron; `registerConnectionsIpc`
 * wires the app singletons.
 */
import { randomUUID } from 'crypto';
import type {
  ConnectResult,
  ConnectionEvent,
  ConnectionInput,
  ConnectionMeta,
  DatabaseInfo,
  TestResult
} from '@shared/ipc';
import { createPool, probeConnection } from '@main/db/poolFactory';
import { toPgErrorInfo } from '@main/db/pgError';
import type { ConnectionRegistry } from '@main/db/ConnectionRegistry';
import { closeSessionsFor } from '@main/db/SessionManager';
import type { CredentialVault } from '@main/vault/CredentialVault';
import { getConnection, listConnections, removeConnection, upsertConnection, type Stores } from '@main/store/stores';
import { handle, push } from './handle';
import { stores } from '@main/store/stores';
import { createVault } from '@main/vault/CredentialVault';
import { registry } from '@main/db/ConnectionRegistry';

export interface ConnectionsDeps {
  stores: Stores;
  vault: CredentialVault;
  registry: ConnectionRegistry;
  emit: (e: ConnectionEvent) => void;
}

const DATABASES_SQL = `SELECT d.datname AS name,
  pg_get_userbyid(d.datdba) AS owner,
  pg_encoding_to_char(d.encoding) AS encoding,
  CASE WHEN d.datallowconn AND has_database_privilege(d.datname, 'CONNECT')
       THEN (SELECT pg_database_size(d.datname))::text END AS size_bytes,
  d.datistemplate AS is_template,
  d.datallowconn AS allow_conn
FROM pg_database d
ORDER BY d.datname`;

interface DbRow {
  name: string;
  owner: string;
  encoding: string;
  size_bytes: string | null;
  is_template: boolean;
  allow_conn: boolean;
}

function toDatabaseInfo(r: DbRow): DatabaseInfo {
  return {
    name: r.name,
    owner: r.owner,
    encoding: r.encoding,
    sizeBytes: r.size_bytes ?? null,
    isTemplate: !!r.is_template,
    allowConn: !!r.allow_conn
  };
}

function readableMessage(err: unknown): string {
  const info = toPgErrorInfo(err);
  return info.hint ? `${info.message} (${info.hint})` : info.message;
}

function validateInput(input: ConnectionInput, existing: ConnectionMeta[]): void {
  const name = (input.name ?? '').trim();
  if (!name) throw new Error('Connection name is required');
  const clash = existing.find((c) => c.id !== input.id && c.name.trim().toLowerCase() === name.toLowerCase());
  if (clash) throw new Error(`A connection named "${clash.name}" already exists`);
  if (!(input.host ?? '').trim()) throw new Error('Host is required');
  const port = Number(input.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be an integer between 1 and 65535');
  if (!(input.user ?? '').trim()) throw new Error('User is required');
}

/** Build the ConnectionMeta shape from an input (no password, no hasPassword decision yet). */
function toMeta(input: ConnectionInput, id: string, prev: ConnectionMeta | undefined): Omit<ConnectionMeta, 'hasPassword'> {
  const now = Date.now();
  const meta: Omit<ConnectionMeta, 'hasPassword'> = {
    id,
    name: input.name.trim(),
    host: input.host.trim(),
    port: Number(input.port),
    user: input.user.trim(),
    defaultDatabase: (input.defaultDatabase ?? '').trim() || 'postgres',
    sslMode: input.sslMode ?? 'disable',
    env: input.env ?? 'local',
    readOnly: !!input.readOnly,
    poolMax: Number(input.poolMax) || 4,
    idleTimeoutMs: Number(input.idleTimeoutMs) || 30000,
    statementTimeoutMs: Math.max(0, Number(input.statementTimeoutMs) || 0),
    connectTimeoutMs: Number(input.connectTimeoutMs) || 5000,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now
  };
  if (input.color) meta.color = input.color;
  if (input.group?.trim()) meta.group = input.group.trim();
  return meta;
}

function credentialsChanged(a: ConnectionMeta | undefined, b: Omit<ConnectionMeta, 'hasPassword'>): boolean {
  if (!a) return true;
  return (
    a.host !== b.host ||
    a.port !== b.port ||
    a.user !== b.user ||
    a.sslMode !== b.sslMode ||
    a.readOnly !== b.readOnly ||
    a.statementTimeoutMs !== b.statementTimeoutMs ||
    a.poolMax !== b.poolMax
  );
}

export function createConnectionsHandlers(deps: ConnectionsDeps) {
  const { stores, vault, registry, emit } = deps;
  /** Passwords the vault refused to persist (OS encryption unavailable); session-only. */
  const sessionPasswords = new Map<string, string>();

  const withHasPassword = (m: ConnectionMeta): ConnectionMeta => ({
    ...m,
    hasPassword: vault.has(m.id) || sessionPasswords.has(m.id)
  });

  const resolvePassword = (id: string | undefined, explicit: string | undefined): string | undefined => {
    if (explicit !== undefined && explicit !== '') return explicit;
    if (!id) return undefined;
    return vault.get(id) ?? sessionPasswords.get(id) ?? undefined;
  };

  async function queryDatabases(pool: import('pg').Pool): Promise<DatabaseInfo[]> {
    const res = await pool.query<DbRow>(DATABASES_SQL);
    return res.rows.map(toDatabaseInfo);
  }

  return {
    async list(): Promise<ConnectionMeta[]> {
      return listConnections(stores)
        .map(withHasPassword)
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    async save(input: ConnectionInput): Promise<ConnectionMeta> {
      const existing = listConnections(stores);
      validateInput(input, existing);
      const id = input.id ?? randomUUID();
      const prev = getConnection(id, stores);
      const meta = toMeta(input, id, prev);

      let passwordChanged = false;
      if (input.password !== undefined && input.password !== '') {
        const r = vault.set(id, input.password);
        if (!r.stored) sessionPasswords.set(id, input.password);
        else sessionPasswords.delete(id);
        passwordChanged = true;
      }
      // `password: ''` with an existing vault entry → keep the stored secret.

      const stored = upsertConnection({ ...meta, hasPassword: vault.has(id) || sessionPasswords.has(id) }, stores);
      if (registry.has(id)) {
        if (passwordChanged || credentialsChanged(prev, meta)) {
          await registry.disconnect(id);
          registry.register(stored, resolvePassword(id, undefined));
        } else {
          registry.updateMeta(stored);
        }
      }
      return withHasPassword(stored);
    },

    async delete({ connectionId }: { connectionId: string }): Promise<void> {
      await registry.unregister(connectionId);
      vault.delete(connectionId);
      removeConnection(connectionId, stores);
      sessionPasswords.delete(connectionId);
    },

    async test(req: ConnectionInput | { connectionId: string }): Promise<TestResult> {
      let meta: Omit<ConnectionMeta, 'hasPassword'>;
      let password: string | undefined;
      if ('connectionId' in req && !('host' in req)) {
        const saved = getConnection(req.connectionId, stores);
        if (!saved) throw new Error(`Unknown connection: ${req.connectionId}`);
        meta = saved;
        password = resolvePassword(saved.id, undefined);
      } else {
        const input = req as ConnectionInput;
        meta = toMeta(input, input.id ?? 'test', input.id ? getConnection(input.id, stores) : undefined);
        password = resolvePassword(input.id, input.password);
      }
      const full: ConnectionMeta = { ...meta, hasPassword: password !== undefined, poolMax: 1 };
      const pool = createPool(full, meta.defaultDatabase || 'postgres', password);
      const started = performance.now();
      try {
        const probe = await pool.query('SELECT 1').then(() => probeConnection(pool));
        const { searchPath: _sp, ...server } = probe;
        void _sp;
        return {
          ok: true,
          server,
          latencyMs: Math.round(performance.now() - started),
          passwordStored: meta.id !== 'test' && vault.has(meta.id)
        };
      } catch (err) {
        return { ok: false, latencyMs: Math.round(performance.now() - started), error: toPgErrorInfo(err) };
      } finally {
        await pool.end().catch(() => undefined);
      }
    },

    async connect({ connectionId, password: explicit }: { connectionId: string; password?: string }): Promise<ConnectResult> {
      const saved = getConnection(connectionId, stores);
      if (!saved) throw new Error(`Unknown connection: ${connectionId}`);
      const password = resolvePassword(connectionId, explicit);
      registry.register(saved, password);
      try {
        const pool = registry.getPool(connectionId, saved.defaultDatabase);
        const probe = await probeConnection(pool);
        const { searchPath, ...server } = probe;
        const databases = await queryDatabases(pool);
        emit({ connectionId, type: 'connected' });
        return { server, databases, searchPath };
      } catch (err) {
        await registry.unregister(connectionId);
        const info = toPgErrorInfo(err);
        if (info.code === '28P01' && password === undefined) throw new Error('Password required');
        throw new Error(readableMessage(err));
      }
    },

    async disconnect({ connectionId }: { connectionId: string }): Promise<void> {
      await closeSessionsFor(connectionId);
      await registry.disconnect(connectionId);
      emit({ connectionId, type: 'disconnected' });
    },

    async listDatabases({ connectionId }: { connectionId: string }): Promise<DatabaseInfo[]> {
      const meta = registry.getMeta(connectionId);
      if (!meta || registry.listDatabasesWithPools(connectionId).length === 0) {
        throw new Error('Not connected');
      }
      return queryDatabases(registry.getPool(connectionId, meta.defaultDatabase));
    }
  };
}

export type ConnectionsHandlers = ReturnType<typeof createConnectionsHandlers>;

/** Wire the app singletons and register every connections:* channel. Main process only. */
export function registerConnectionsIpc(): void {

  const h = createConnectionsHandlers({
    stores: stores(),
    vault: createVault(),
    registry,
    emit: (e) => push('connections:event', e)
  });

  handle('connections:list', () => h.list());
  handle('connections:save', (req) => h.save(req));
  handle('connections:delete', (req) => h.delete(req));
  handle('connections:test', (req) => h.test(req));
  handle('connections:connect', (req) => h.connect(req));
  handle('connections:disconnect', (req) => h.disconnect(req));
  handle('connections:listDatabases', (req) => h.listDatabases(req));
}
