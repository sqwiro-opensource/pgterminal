import type { Pool, PoolClient } from 'pg';
import type { OverviewSection, ServerOverview, SlowQuery } from '@shared/types/stats';
import { toPgErrorInfo } from '@main/db/pgError';
import { APPLICATION_NAME } from '@main/db/poolFactory';
import { timescaleSummarySql } from '@main/catalog/sql/timescale.sql';

export interface OverviewOptions {
  /** Per-section `SET LOCAL statement_timeout` in ms (default 5000). */
  statementTimeoutMs?: number;
  /** Marks activity rows that belong to this app; defaults to application_name = 'pgui'. */
  isOwn?: (row: { app: string; pid: number }) => boolean;
}

const SLOW_QUERY_HINT =
  "pg_stat_statements is not available. Enable it with `CREATE EXTENSION pg_stat_statements;` after adding it to shared_preload_libraries in postgresql.conf (requires a restart).";

type Errors = Partial<Record<OverviewSection, string>>;

/** Runs `fn` inside its own read-only transaction with a statement timeout; failures are captured, never thrown. */
async function section<T>(client: PoolClient, name: OverviewSection, timeoutMs: number, errors: Errors, fn: () => Promise<T>, fallback: T): Promise<T> {
  const ms = Math.max(1, Math.floor(timeoutMs));
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = ${ms}`);
    const out = await fn();
    await client.query('COMMIT');
    return out;
  } catch (err) {
    errors[name] = toPgErrorInfo(err).message;
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connection may be gone */
    }
    return fallback;
  }
}

function ratio(hit: string, read: string): number | null {
  const h = Number(hit);
  const r = Number(read);
  if (!Number.isFinite(h) || !Number.isFinite(r) || h + r === 0) return null;
  return h / (h + r);
}

interface SlowRow {
  queryid: string | null;
  calls: string;
  total_ms: number;
  mean_ms: number;
  rows: string;
  query: string;
}

const toSlow = (r: SlowRow): SlowQuery => ({
  queryId: r.queryid ?? '',
  calls: r.calls,
  totalMs: Number(r.total_ms),
  meanMs: Number(r.mean_ms),
  rows: r.rows,
  query: r.query
});

/** Collects the server overview. Each section is independent: a failing one reports its error and returns empty data. */
export async function getOverview(pool: Pool, connectionId: string, opts: OverviewOptions = {}): Promise<ServerOverview> {
  const timeout = opts.statementTimeoutMs ?? 5000;
  const isOwn = opts.isOwn ?? ((row) => row.app === APPLICATION_NAME);
  const errors: Errors = {};
  const client = await pool.connect();
  try {
    const server = await section<ServerOverview['server']>(
      client,
      'server',
      timeout,
      errors,
      async () => {
        const r = await client.query<{
          version: string;
          version_num: number;
          started_at: string;
          max_connections: number;
          is_superuser: boolean;
          in_recovery: boolean;
          extensions: string[];
        }>(
          `SELECT version() AS version,
                  current_setting('server_version_num')::int AS version_num,
                  pg_postmaster_start_time()::text AS started_at,
                  current_setting('max_connections')::int AS max_connections,
                  current_setting('is_superuser')::bool AS is_superuser,
                  pg_is_in_recovery() AS in_recovery,
                  (SELECT coalesce(array_agg(extname::text ORDER BY extname), '{}'::text[]) FROM pg_extension) AS extensions`
        );
        const row = r.rows[0];
        if (!row) throw new Error('no server row');
        return {
          version: row.version,
          versionNum: Number(row.version_num),
          startedAt: row.started_at,
          maxConnections: Number(row.max_connections),
          extensions: row.extensions ?? [],
          isSuperuser: row.is_superuser,
          inRecovery: row.in_recovery
        };
      },
      { version: '', versionNum: 0, startedAt: '', maxConnections: 0, extensions: [] }
    );

    const databases = await section(
      client,
      'databases',
      timeout,
      errors,
      async () => {
        const r = await client.query<{
          name: string;
          size_bytes: string;
          backends: number;
          xact_commit: string;
          xact_rollback: string;
          blks_hit: string;
          blks_read: string;
          deadlocks: string;
          temp_bytes: string;
        }>(
          `SELECT d.datname AS name,
                  CASE WHEN d.datallowconn AND has_database_privilege(d.datname, 'CONNECT')
                       THEN pg_database_size(d.datname)::text ELSE '0' END AS size_bytes,
                  s.numbackends AS backends,
                  s.xact_commit::text AS xact_commit, s.xact_rollback::text AS xact_rollback,
                  s.blks_hit::text AS blks_hit, s.blks_read::text AS blks_read,
                  s.deadlocks::text AS deadlocks, s.temp_bytes::text AS temp_bytes
           FROM pg_database d JOIN pg_stat_database s ON s.datid = d.oid
           WHERE NOT d.datistemplate
           ORDER BY d.datname`
        );
        return r.rows.map((d) => ({
          name: d.name,
          sizeBytes: d.size_bytes,
          backends: Number(d.backends),
          xactCommit: d.xact_commit,
          xactRollback: d.xact_rollback,
          blksHit: d.blks_hit,
          blksRead: d.blks_read,
          deadlocks: d.deadlocks,
          tempBytes: d.temp_bytes,
          cacheHitRatio: ratio(d.blks_hit, d.blks_read)
        }));
      },
      []
    );

    const activity = await section(
      client,
      'activity',
      timeout,
      errors,
      async () => {
        const r = await client.query<{
          pid: number;
          user: string | null;
          database: string | null;
          app: string | null;
          client: string | null;
          state: string | null;
          wait_event_type: string | null;
          wait_event: string | null;
          xact_start: string | null;
          query_start: string | null;
          duration_ms: number | null;
          query: string | null;
          blocked_by: number[] | null;
        }>(
          `SELECT pid, usename AS "user", datname AS database, application_name AS app, client_addr::text AS client,
                  state, wait_event_type, wait_event, xact_start::text AS xact_start, query_start::text AS query_start,
                  CASE WHEN query_start IS NULL THEN NULL
                       ELSE (EXTRACT(EPOCH FROM (now() - query_start)) * 1000)::float8 END AS duration_ms,
                  left(query, 300) AS query, pg_blocking_pids(pid) AS blocked_by
           FROM pg_stat_activity
           WHERE datname IS NOT NULL OR backend_type = 'client backend'
           ORDER BY pid`
        );
        return r.rows.map((a) => {
          const app = a.app ?? '';
          return {
            pid: Number(a.pid),
            user: a.user ?? '',
            database: a.database ?? '',
            app,
            client: a.client,
            state: a.state,
            waitEventType: a.wait_event_type,
            waitEvent: a.wait_event,
            xactStart: a.xact_start,
            queryStart: a.query_start,
            durationMs: a.duration_ms === null ? null : Number(a.duration_ms),
            query: a.query ?? '',
            blockedBy: (a.blocked_by ?? []).map(Number),
            isOwn: isOwn({ app, pid: Number(a.pid) })
          };
        });
      },
      []
    );

    const locks = await section(
      client,
      'locks',
      timeout,
      errors,
      async () => {
        const r = await client.query<{
          pid: number;
          locktype: string;
          mode: string;
          granted: boolean;
          relation: string | null;
          database: string | null;
          blocked_by: number[] | null;
        }>(
          `SELECT l.pid, l.locktype, l.mode, l.granted,
                  CASE WHEN l.relation IS NOT NULL THEN l.relation::regclass::text END AS relation,
                  d.datname AS database, pg_blocking_pids(l.pid) AS blocked_by
           FROM pg_locks l LEFT JOIN pg_database d ON d.oid = l.database
           WHERE NOT l.granted
              OR l.pid IN (SELECT unnest(pg_blocking_pids(a.pid)) FROM pg_stat_activity a WHERE cardinality(pg_blocking_pids(a.pid)) > 0)
           ORDER BY l.pid`
        );
        return r.rows.map((l) => ({
          pid: Number(l.pid),
          locktype: l.locktype,
          mode: l.mode,
          granted: Boolean(l.granted),
          relation: l.relation,
          database: l.database,
          blockedBy: (l.blocked_by ?? []).map(Number)
        }));
      },
      []
    );

    let slowQueriesHint: string | undefined;
    const slowQueries = await section<ServerOverview['slowQueries']>(
      client,
      'slowQueries',
      timeout,
      errors,
      async () => {
        const ext = await client.query<{ installed: boolean }>(`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS installed`);
        if (!ext.rows[0]?.installed) {
          slowQueriesHint = SLOW_QUERY_HINT;
          return null;
        }
        const cols = `queryid::text AS queryid, calls::text AS calls, total_exec_time::float8 AS total_ms, mean_exec_time::float8 AS mean_ms, rows::text AS rows, left(query, 500) AS query`;
        const [byTotal, byMean] = await Promise.all([
          client.query<SlowRow>(`SELECT ${cols} FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20`),
          client.query<SlowRow>(`SELECT ${cols} FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 20`)
        ]);
        return { source: 'pg_stat_statements' as const, byTotal: byTotal.rows.map(toSlow), byMean: byMean.rows.map(toSlow) };
      },
      null
    );
    if (slowQueries === null && !slowQueriesHint) slowQueriesHint = SLOW_QUERY_HINT;

    const replication = await section(
      client,
      'replication',
      timeout,
      errors,
      async () => {
        const r = await client.query<{ client: string | null; state: string | null; sent_lsn: string | null; replay_lsn: string | null; lag_bytes: string | null }>(
          `SELECT client_addr::text AS client, state, sent_lsn::text AS sent_lsn, replay_lsn::text AS replay_lsn,
                  CASE WHEN sent_lsn IS NULL OR replay_lsn IS NULL THEN NULL ELSE pg_wal_lsn_diff(sent_lsn, replay_lsn)::text END AS lag_bytes
           FROM pg_stat_replication ORDER BY client_addr`
        );
        return r.rows.map((x) => ({ client: x.client, state: x.state ?? '', sentLsn: x.sent_lsn ?? '', replayLsn: x.replay_lsn ?? '', lagBytes: x.lag_bytes }));
      },
      []
    );

    const timescale = await section<ServerOverview['timescale']>(
      client,
      'timescale',
      timeout,
      errors,
      async () => {
        if (!server.extensions.includes('timescaledb')) return null;
        const q = timescaleSummarySql();
        const r = await client.query<{ hypertables: number; chunks: number; compressed_chunks: number }>(q.text, q.values);
        const row = r.rows[0];
        if (!row) return null;
        const chunks = Number(row.chunks);
        const compressedChunks = Number(row.compressed_chunks);
        return { hypertables: Number(row.hypertables), chunks, compressedChunks, compressedRatio: chunks > 0 ? compressedChunks / chunks : null };
      },
      null
    );

    return {
      connectionId,
      collectedAt: Date.now(),
      server,
      databases,
      activity,
      locks,
      slowQueries,
      replication,
      timescale,
      ...(slowQueriesHint ? { slowQueriesHint } : {}),
      ...(Object.keys(errors).length ? { errors } : {})
    };
  } finally {
    client.release();
  }
}

export interface CancelBackendOptions {
  pid: number;
  terminate: boolean;
  /** Backends this app owns must never be cancelled from the overview; defaults to application_name = 'pgui'. */
  isOwn?: (row: { app: string; pid: number }) => boolean;
}

/** Cancels (or terminates) another session. Returns `{ ok: false }` for the app's own backends or unknown pids. */
export async function cancelBackend(pool: Pool, opts: CancelBackendOptions): Promise<{ ok: boolean; reason?: string }> {
  const isOwn = opts.isOwn ?? ((row) => row.app === APPLICATION_NAME);
  const who = await pool.query<{ app: string | null }>(`SELECT application_name AS app FROM pg_stat_activity WHERE pid = $1`, [opts.pid]);
  const row = who.rows[0];
  if (!row) return { ok: false, reason: `No backend with pid ${opts.pid}` };
  if (isOwn({ app: row.app ?? '', pid: opts.pid })) return { ok: false, reason: 'That backend belongs to pgui; cancel it from its own tab instead' };
  const fn = opts.terminate ? 'pg_terminate_backend' : 'pg_cancel_backend';
  const r = await pool.query<{ ok: boolean }>(`SELECT ${fn}($1) AS ok`, [opts.pid]);
  return { ok: Boolean(r.rows[0]?.ok) };
}
