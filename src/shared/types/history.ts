/** One executed statement in the query history. */
export interface HistoryEntry {
  id: string;
  connectionId: string;
  database: string;
  sql: string;
  startedAt: number;
  durationMs: number;
  rowCount: number | null;
  status: 'ok' | 'error' | 'cancelled';
  errorCode?: string;
}
