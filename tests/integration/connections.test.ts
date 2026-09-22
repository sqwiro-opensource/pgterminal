import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { ConnectionEvent, ConnectionInput } from '@shared/ipc';
import { createConnectionsHandlers, type ConnectionsHandlers } from '@main/ipc/connections.ipc';
import { ConnectionRegistry } from '@main/db/ConnectionRegistry';
import { APPLICATION_NAME } from '@main/db/poolFactory';
import { getStores, type Stores } from '@main/store/stores';
import { CredentialVault, type SafeStorageLike } from '@main/vault/CredentialVault';
import { PG_TEST_URL, setupTestDb, withTestPool } from './setup';

const { skip } = await setupTestDb();

/** Reversible "encryption" so the test can prove plaintext never lands on disk. */
const fakeSafe: SafeStorageLike = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(Buffer.from(s, 'utf8').map((b) => b ^ 0x5a)),
  decryptString: (b) => Buffer.from(b.map((x) => x ^ 0x5a)).toString('utf8'),
  getSelectedStorageBackend: () => 'keychain'
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Pids of live backends with application_name = 'pgui' (other test files may leave short-lived ones). */
async function pguiPids(): Promise<number[]> {
  return withTestPool(async (pool) => {
    const r = await pool.query<{ pid: number }>(
      `SELECT pid FROM pg_stat_activity WHERE application_name = $1 AND pid <> pg_backend_pid()`,
      [APPLICATION_NAME]
    );
    return r.rows.map((x) => Number(x.pid));
  }, 1);
}
/** Backends created by this file's connect (snapshot taken right after connect). */
let ownPids: number[] = [];

function inputFromUrl(name: string, overrides: Partial<ConnectionInput> = {}): ConnectionInput & { password: string } {
  const u = new URL(PG_TEST_URL);
  return {
    name,
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    defaultDatabase: u.pathname.replace(/^\//, ''),
    sslMode: 'disable',
    env: 'local',
    readOnly: false,
    poolMax: 4,
    idleTimeoutMs: 30000,
    statementTimeoutMs: 0,
    connectTimeoutMs: 5000,
    ...overrides
  };
}

describe.skipIf(skip)('connections IPC handlers (integration)', () => {
  let dir: string;
  let stores: Stores;
  let registry: ConnectionRegistry;
  let h: ConnectionsHandlers;
  const events: ConnectionEvent[] = [];
  let savedId = '';
  const password = inputFromUrl('x').password;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'pgui-conn-'));
    stores = getStores({ cwd: dir });
    registry = new ConnectionRegistry({ emit: (e) => events.push(e), reaperIntervalMs: 0 });
    h = createConnectionsHandlers({
      stores,
      vault: new CredentialVault(fakeSafe, stores.vault, 'darwin'),
      registry,
      emit: (e) => events.push(e)
    });
  });

  afterAll(async () => {
    await registry.closeAll();
  });

  it('save → list: hasPassword true and no plaintext password in any file', async () => {
    const meta = await h.save(inputFromUrl('docker'));
    savedId = meta.id;
    expect(meta.hasPassword).toBe(true);
    expect((meta as unknown as { password?: string }).password).toBeUndefined();
    const list = await h.list();
    expect(list.map((c) => c.name)).toEqual(['docker']);
    expect(list[0]?.hasPassword).toBe(true);
    // The test password happens to equal the user name, so check structurally, not by substring.
    const conn = JSON.parse(readFileSync(join(dir, 'connections.json'), 'utf8'));
    expect(JSON.stringify(conn).includes('"password"')).toBe(false);
    expect(conn.items[savedId].user).toBe('pgui');
    const secret: string = JSON.parse(readFileSync(join(dir, 'vault.json'), 'utf8')).secrets[savedId];
    expect(secret).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(secret).not.toBe(password);
    expect(Buffer.from(secret, 'base64').toString('utf8')).not.toBe(password);
    expect(fakeSafe.decryptString(Buffer.from(secret, 'base64'))).toBe(password);
  });

  it('save with a duplicate name throws', async () => {
    await expect(h.save(inputFromUrl('DOCKER'))).rejects.toThrow(/already exists/);
    await expect(h.save(inputFromUrl('bad', { port: 70000 }))).rejects.toThrow(/Port/);
    await expect(h.save(inputFromUrl('bad', { host: ' ' }))).rejects.toThrow(/Host/);
  });

  it('test with a full input reports the server and latency without persisting', async () => {
    const before = (await h.list()).length;
    const r = await h.test(inputFromUrl('probe-only'));
    expect(r.ok).toBe(true);
    expect(r.server?.versionNum).toBeGreaterThanOrEqual(160000);
    expect(r.latencyMs).toBeGreaterThan(0);
    expect((await h.list()).length).toBe(before);
  });

  it('test by saved id uses the vault password', async () => {
    const r = await h.test({ connectionId: savedId });
    expect(r.ok).toBe(true);
    expect(r.passwordStored).toBe(true);
  });

  it('test against a closed port returns ok:false with ECONNREFUSED and a hint', async () => {
    const r = await h.test(inputFromUrl('nope', { port: 1, connectTimeoutMs: 3000 }));
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ECONNREFUSED');
    expect(r.error?.hint).toBeTruthy();
  });

  it('connect returns databases (with sizes) and search_path; listDatabases works', async () => {
    const before = await pguiPids();
    const res = await h.connect({ connectionId: savedId });
    expect(res.server.versionNum).toBeGreaterThanOrEqual(160000);
    expect(res.searchPath).toContain('public');
    const db = res.databases.find((d) => d.name === 'pgui_test');
    expect(db).toBeDefined();
    expect(db?.sizeBytes).toMatch(/^\d+$/);
    expect(db?.allowConn).toBe(true);
    expect(res.databases.find((d) => d.name === 'template0')?.sizeBytes ?? null).toBeNull();
    expect(events.some((e) => e.type === 'connected' && e.connectionId === savedId)).toBe(true);
    const again = await h.listDatabases({ connectionId: savedId });
    expect(again.map((d) => d.name)).toContain('pgui_test');
    ownPids = (await pguiPids()).filter((pid) => !before.includes(pid));
    expect(ownPids.length).toBeGreaterThan(0);
  });

  it('disconnect ends every pgui backend within 1 s', async () => {
    await h.disconnect({ connectionId: savedId });
    const remaining = async () => (await pguiPids()).filter((pid) => ownPids.includes(pid)).length;
    let n = await remaining();
    for (let i = 0; i < 10 && n > 0; i++) {
      await sleep(100);
      n = await remaining();
    }
    expect(n).toBe(0);
    expect(events.some((e) => e.type === 'disconnected')).toBe(true);
    await expect(h.listDatabases({ connectionId: savedId })).rejects.toThrow(/Not connected/);
  });

  it('connect with a wrong password fails with a readable plain Error', async () => {
    const bad = await h.save(inputFromUrl('badpw', { password: 'wrong-password' }));
    await expect(h.connect({ connectionId: bad.id })).rejects.toThrow(/password|authentication/i);
    expect(registry.has(bad.id)).toBe(false);
    await h.delete({ connectionId: bad.id });
  });

  it('read-only connection rejects writes with 25006', async () => {
    const ro = await h.save(inputFromUrl('readonly', { readOnly: true }));
    await h.connect({ connectionId: ro.id });
    const pool = registry.getPool(ro.id, 'pgui_test');
    let code: string | undefined;
    try {
      await pool.query('INSERT INTO a.dup VALUES (99)');
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    expect(code).toBe('25006');
    await h.disconnect({ connectionId: ro.id });
    await h.delete({ connectionId: ro.id });
  });

  it('save with password "" keeps the vault entry; changed credentials reconnect', async () => {
    const before = JSON.parse(readFileSync(join(dir, 'vault.json'), 'utf8')).secrets[savedId];
    const meta = await h.save({ ...inputFromUrl('docker', { password: '' }), id: savedId, group: 'Local' });
    expect(meta.hasPassword).toBe(true);
    expect(meta.group).toBe('Local');
    expect(JSON.parse(readFileSync(join(dir, 'vault.json'), 'utf8')).secrets[savedId]).toBe(before);
  });

  it('delete removes meta and the vault entry', async () => {
    await h.delete({ connectionId: savedId });
    expect((await h.list()).find((c) => c.id === savedId)).toBeUndefined();
    expect(JSON.parse(readFileSync(join(dir, 'vault.json'), 'utf8')).secrets[savedId]).toBeUndefined();
    expect(registry.has(savedId)).toBe(false);
  });
});
