import { randomUUID } from 'crypto';
import type { HistoryEntry, QueryEvent } from '@shared/ipc';
import { appendHistory, clearHistory, getSettings, listHistory, type Stores } from '@main/store/stores';

const DAY_MS = 86_400_000;

/** Thin service over the history store with retention pruning from settings. */
export class QueryHistory {
  constructor(private readonly stores?: Stores) {}

  private settings(): { historyRetentionDays: number; historyMax: number } {
    try {
      const s = getSettings(this.stores);
      return { historyRetentionDays: s.historyRetentionDays, historyMax: s.historyMax };
    } catch {
      return { historyRetentionDays: 30, historyMax: 5000 };
    }
  }

  record(entry: Omit<HistoryEntry, 'id'> & { id?: string }): HistoryEntry {
    const full: HistoryEntry = { id: entry.id ?? randomUUID(), ...entry };
    appendHistory(full, this.stores);
    return full;
  }

  list(q: { connectionId?: string; search?: string; limit?: number } = {}): HistoryEntry[] {
    const { historyRetentionDays, historyMax } = this.settings();
    const cutoff = historyRetentionDays > 0 ? Date.now() - historyRetentionDays * DAY_MS : 0;
    return listHistory({ ...q, limit: Math.min(q.limit ?? 200, historyMax) }, this.stores).filter((e) => e.startedAt >= cutoff);
  }

  clear(connectionId?: string): void {
    clearHistory(connectionId, this.stores);
  }
}

/** Accumulates the outcome of one run from its events, ready to be recorded. */
export class RunRecorder {
  private rowCount: number | null = null;
  private status: HistoryEntry['status'] = 'ok';
  private errorCode: string | undefined;
  private readonly startedAt = Date.now();

  constructor(
    private readonly base: { connectionId: string; database: string; sql: string },
    private readonly history: QueryHistory
  ) {}

  /** Feed every event; returns the recorded entry when the run is finished, else undefined. */
  observe(e: QueryEvent): HistoryEntry | undefined {
    switch (e.type) {
      case 'statementDone':
        if (e.rowCount !== null) this.rowCount = (this.rowCount ?? 0) + e.rowCount;
        return undefined;
      case 'error':
        this.status = 'error';
        this.errorCode = e.error.code;
        return undefined;
      case 'cancelled':
        this.status = 'cancelled';
        return this.finish();
      case 'done':
        return this.finish();
      default:
        return undefined;
    }
  }

  private finish(): HistoryEntry | undefined {
    if (!this.base.sql.trim()) return undefined;
    return this.history.record({
      ...this.base,
      startedAt: this.startedAt,
      durationMs: Date.now() - this.startedAt,
      rowCount: this.rowCount,
      status: this.status,
      errorCode: this.errorCode
    });
  }
}
