import { describe, expect, it } from 'vitest';
import type { ServerOverview } from '../../../src/shared/types/stats';
import {
  barPercent,
  blockingChains,
  cacheHitPercent,
  formatDuration,
  formatUptime,
  maxSize,
  sessionsSummary,
  sortActivity,
  tpsDelta,
  totalCommits
} from '../../../src/renderer/src/features/overview/overviewModel';

type Db = ServerOverview['databases'][number];
type Act = ServerOverview['activity'][number];

const db = (o: Partial<Db>): Db => ({
  name: 'x', sizeBytes: '0', backends: 0, xactCommit: '0', xactRollback: '0', blksHit: '0', blksRead: '0', deadlocks: '0', tempBytes: '0', cacheHitRatio: null, ...o
});
const act = (o: Partial<Act>): Act => ({
  pid: 1, user: 'u', database: 'd', app: 'a', client: null, state: 'idle', waitEventType: null, waitEvent: null, xactStart: null, queryStart: null, durationMs: null, query: '', blockedBy: [], ...o
});

describe('overviewModel', () => {
  it('formats uptime and durations', () => {
    const now = Date.parse('2026-09-22T12:00:00Z');
    expect(formatUptime('2026-08-11T09:00:00Z', now)).toBe('42d 3h');
    expect(formatUptime('2026-09-22T08:48:00Z', now)).toBe('3h 12m');
    expect(formatUptime('2026-09-22T11:48:00Z', now)).toBe('12m');
    expect(formatUptime('garbage', now)).toBe('—');
    expect(formatDuration(12)).toBe('12 ms');
    expect(formatDuration(41_000)).toBe('41 s');
    expect(formatDuration(123_000)).toBe('2 m 3 s');
    expect(formatDuration(3_840_000)).toBe('1 h 4 m');
    expect(formatDuration(null)).toBe('—');
  });

  it('computes cache hit percent across databases', () => {
    expect(cacheHitPercent([db({ blksHit: '90', blksRead: '10' }), db({ blksHit: '100', blksRead: '0' })])).toBeCloseTo(95, 5);
    expect(cacheHitPercent([db({})])).toBeNull();
  });

  it('summarises sessions', () => {
    const s = sessionsSummary([
      act({ state: 'active' }),
      act({ state: 'idle' }),
      act({ state: 'idle in transaction' }),
      act({ state: 'active', blockedBy: [9] })
    ]);
    expect(s).toEqual({ total: 4, active: 2, idle: 1, idleInTx: 1, waiting: 1 });
  });

  it('computes TPS from two samples and rejects resets', () => {
    expect(tpsDelta(null, { commits: 10, at: 1000 })).toBeNull();
    expect(tpsDelta({ commits: 10, at: 1000 }, { commits: 70, at: 6000 })).toBe(12);
    expect(tpsDelta({ commits: 70, at: 1000 }, { commits: 10, at: 6000 })).toBeNull();
    expect(totalCommits([db({ xactCommit: '5' }), db({ xactCommit: '7' })])).toBe(12);
  });

  it('builds blocking chains from activity and locks', () => {
    const chains = blockingChains(
      [act({ pid: 4412, blockedBy: [4390] }), act({ pid: 4390 })],
      [
        { pid: 4412, locktype: 'relation', mode: 'RowExclusiveLock', granted: false, relation: 'sales.sales_order', database: 'd', blockedBy: [4390] },
        { pid: 4433, locktype: 'relation', mode: 'AccessShareLock', granted: false, relation: 'analytics.mv', database: 'd', blockedBy: [4521] }
      ]
    );
    expect(chains).toEqual([
      { blocked: 4412, blocker: 4390, relation: 'sales.sales_order', mode: 'RowExclusiveLock' },
      { blocked: 4433, blocker: 4521, relation: 'analytics.mv', mode: 'AccessShareLock' }
    ]);
  });

  it('scales size bars', () => {
    const dbs = [db({ sizeBytes: '1000' }), db({ sizeBytes: '250' }), db({ sizeBytes: '1' })];
    const max = maxSize(dbs);
    expect(max).toBe(1000);
    expect(barPercent('1000', max)).toBe(100);
    expect(barPercent('250', max)).toBe(25);
    expect(barPercent('1', max)).toBe(1);
    expect(barPercent('0', max)).toBe(0);
  });

  it('sorts activity: blocked, active, idle-in-tx, then idle; hides idle on request', () => {
    const rows = [
      act({ pid: 1, state: 'idle' }),
      act({ pid: 2, state: 'active', durationMs: 5 }),
      act({ pid: 3, state: 'active', durationMs: 50 }),
      act({ pid: 4, state: 'idle in transaction' }),
      act({ pid: 5, state: 'active', blockedBy: [3] })
    ];
    expect(sortActivity(rows, true).map((a) => a.pid)).toEqual([5, 3, 2, 4, 1]);
    expect(sortActivity(rows, false).map((a) => a.pid)).toEqual([5, 3, 2, 4]);
  });
});
