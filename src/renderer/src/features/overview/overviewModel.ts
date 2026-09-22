import type { ServerOverview } from '@shared/types/stats';

type Db = ServerOverview['databases'][number];
type Activity = ServerOverview['activity'][number];
type Lock = ServerOverview['locks'][number];

/** "42d 3h", "3h 12m", "12m" or "<1m" from a postmaster start timestamp. */
export function formatUptime(startedAt: string, now: number = Date.now()): string {
  const t = Date.parse(startedAt);
  if (!Number.isFinite(t)) return '—';
  const s = Math.max(0, Math.floor((now - t) / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return '<1m';
}

/** "12 ms", "41 s", "2 m 3 s", "1 h 4 m". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} m ${s % 60} s`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} m`;
}

/** Aggregate cache hit ratio over all databases in percent, or null when no I/O has been recorded. */
export function cacheHitPercent(databases: Db[]): number | null {
  let hit = 0;
  let read = 0;
  for (const d of databases) {
    hit += Number(d.blksHit) || 0;
    read += Number(d.blksRead) || 0;
  }
  if (hit + read === 0) return null;
  return (hit / (hit + read)) * 100;
}

export interface SessionsSummary {
  total: number;
  active: number;
  idle: number;
  idleInTx: number;
  waiting: number;
}

export function sessionsSummary(activity: Activity[]): SessionsSummary {
  const out: SessionsSummary = { total: 0, active: 0, idle: 0, idleInTx: 0, waiting: 0 };
  for (const a of activity) {
    out.total += 1;
    if (a.state === 'active') out.active += 1;
    else if (a.state === 'idle') out.idle += 1;
    else if (a.state === 'idle in transaction' || a.state === 'idle in transaction (aborted)') out.idleInTx += 1;
    if (a.blockedBy.length > 0 || a.waitEventType === 'Lock') out.waiting += 1;
  }
  return out;
}

/** Sum of xact_commit over all databases (as a number; display only). */
export function totalCommits(databases: Db[]): number {
  return databases.reduce((n, d) => n + (Number(d.xactCommit) || 0), 0);
}

export interface TpsSample {
  commits: number;
  at: number;
}

/** Transactions per second between two samples; null on the first sample or a counter reset. */
export function tpsDelta(prev: TpsSample | null, curr: TpsSample): number | null {
  if (!prev) return null;
  const dt = (curr.at - prev.at) / 1000;
  const dc = curr.commits - prev.commits;
  if (dt <= 0 || dc < 0) return null;
  return dc / dt;
}

export interface BlockingChain {
  blocked: number;
  blocker: number;
  relation: string | null;
  mode: string | null;
}

/** One row per (blocked, blocker) pair, with the relation the blocked pid is waiting on when known. */
export function blockingChains(activity: Activity[], locks: Lock[]): BlockingChain[] {
  const waiting = new Map<number, Lock>();
  for (const l of locks) if (!l.granted && !waiting.has(l.pid)) waiting.set(l.pid, l);
  const out: BlockingChain[] = [];
  for (const a of activity) {
    for (const blocker of a.blockedBy) {
      const w = waiting.get(a.pid);
      out.push({ blocked: a.pid, blocker, relation: w?.relation ?? null, mode: w?.mode ?? null });
    }
  }
  // Locks may know about waiters that activity did not list (e.g. filtered rows).
  for (const l of locks) {
    if (l.granted) continue;
    for (const blocker of l.blockedBy) {
      if (!out.some((c) => c.blocked === l.pid && c.blocker === blocker)) {
        out.push({ blocked: l.pid, blocker, relation: l.relation, mode: l.mode });
      }
    }
  }
  return out.sort((x, y) => x.blocked - y.blocked || x.blocker - y.blocker);
}

/** Largest database size (bytes) for proportional bars. */
export function maxSize(databases: Db[]): number {
  return databases.reduce((m, d) => Math.max(m, Number(d.sizeBytes) || 0), 0);
}

/** Bar width in percent, never below 1 for a non-empty database. */
export function barPercent(sizeBytes: string, max: number): number {
  const n = Number(sizeBytes) || 0;
  if (max <= 0 || n <= 0) return 0;
  return Math.max(1, Math.round((n / max) * 100));
}

export function totalSize(databases: Db[]): number {
  return databases.reduce((n, d) => n + (Number(d.sizeBytes) || 0), 0);
}

/** "sqwiro-api · 100.90.157.12" style secondary line for a session. */
export function sessionSecondary(a: Activity): string {
  const parts = [a.app || null, a.client || null].filter((x): x is string => Boolean(x));
  return parts.join(' · ');
}

/** Rows with state active/idle in tx/waiting first, then idle; each group by duration desc. */
export function sortActivity(activity: Activity[], showIdle: boolean): Activity[] {
  const keep = showIdle ? activity : activity.filter((a) => a.state !== 'idle');
  const rank = (a: Activity): number => (a.blockedBy.length > 0 ? 0 : a.state === 'active' ? 1 : a.state?.startsWith('idle in') ? 2 : 3);
  return keep.slice().sort((x, y) => rank(x) - rank(y) || (y.durationMs ?? 0) - (x.durationMs ?? 0));
}
