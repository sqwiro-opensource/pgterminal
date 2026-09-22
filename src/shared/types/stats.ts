/** One pg_stat_statements row. */
export interface SlowQuery {
  queryId: string;
  calls: string;
  totalMs: number;
  meanMs: number;
  rows: string;
  query: string;
}

/** Snapshot for the server overview tab. Bigints are strings. */
export interface ServerOverview {
  connectionId: string;
  collectedAt: number;
  server: {
    version: string;
    versionNum: number;
    startedAt: string;
    maxConnections: number;
    extensions: string[];
    isSuperuser?: boolean;
    /** True on a streaming standby. */
    inRecovery?: boolean;
  };
  databases: Array<{
    name: string;
    sizeBytes: string;
    backends: number;
    xactCommit: string;
    xactRollback: string;
    blksHit: string;
    blksRead: string;
    deadlocks: string;
    tempBytes: string;
    cacheHitRatio: number | null;
  }>;
  activity: Array<{
    pid: number;
    user: string;
    database: string;
    app: string;
    client: string | null;
    state: string | null;
    waitEventType: string | null;
    waitEvent: string | null;
    xactStart: string | null;
    queryStart: string | null;
    durationMs: number | null;
    query: string;
    blockedBy: number[];
    /** Backend opened by this app (application_name = 'pgterminal'); never cancellable from the UI. */
    isOwn?: boolean;
  }>;
  locks: Array<{
    pid: number;
    locktype: string;
    mode: string;
    granted: boolean;
    relation: string | null;
    database: string | null;
    blockedBy: number[];
  }>;
  slowQueries: null | { source: 'pg_stat_statements'; byTotal: SlowQuery[]; byMean: SlowQuery[] };
  replication: Array<{
    client: string | null;
    state: string;
    sentLsn: string;
    replayLsn: string;
    lagBytes: string | null;
  }>;
  /** Present only when the TimescaleDB extension is installed. */
  timescale?: { hypertables: number; chunks: number; compressedChunks: number; compressedRatio: number | null } | null;
  /** Human hint shown when slowQueries is null (extension missing or unreadable). */
  slowQueriesHint?: string;
  /** Per-section errors (section name → message); the section then holds its fallback value. */
  errors?: Partial<Record<OverviewSection, string>>;
}

/** Sections of the overview that load and fail independently. */
export type OverviewSection = 'server' | 'databases' | 'activity' | 'locks' | 'slowQueries' | 'replication' | 'timescale';
