import type { CellValue, FieldInfo, PgErrorInfo } from './query';

/** Parsed `[schema.]table/key` reference. */
export interface DocRef {
  raw: string;
  schemaHint: string | null;
  table: string;
  key: string;
}

/** How a candidate relation was matched (lower rank wins). */
export type DocTargetReason = 'explicit' | 'prefixedName' | 'strippedName' | 'searchPath' | 'anySchema';

/** A resolved (or candidate) link target. */
export interface DocTarget {
  schema: string;
  table: string;
  keyColumn: string;
  keyValue: string;
  rank: number;
  reason: DocTargetReason;
}

/** Result of doclink:resolve. */
export type DocLinkResolution =
  | { status: 'found'; target: DocTarget; row: Record<string, CellValue>; fields: FieldInfo[] }
  | { status: 'ambiguous'; candidates: DocTarget[] }
  | { status: 'notFound'; candidates: DocTarget[] }
  | { status: 'invalid'; reason: string };

/** Request for doclink:resolve. */
export interface ResolveDocLinkRequest {
  connectionId: string;
  database: string;
  ref: DocRef;
  preferred?: { schema: string; table: string };
}

/** Scope of a backlink search. */
export type BacklinkScopeMode = 'fkOnly' | 'sameSchema' | 'wholeDb' | 'tables';

/** How a backlink group was found. */
export type BacklinkVia = 'fk' | 'jsonb' | 'text' | 'array';

/** Request for doclink:backlinks; results stream on doclink:backlinksEvent. */
export interface BacklinksRequest {
  jobId: string;
  connectionId: string;
  database: string;
  target: DocTarget;
  row: Record<string, CellValue>;
  scope: { mode: BacklinkScopeMode; tables?: Array<{ schema: string; table: string }> };
  perTableLimit: number;
  perQueryTimeoutMs: number;
}

/** One planned or completed backlink group. */
export interface BacklinkGroupRef {
  via: BacklinkVia;
  schema: string;
  table: string;
  column: string;
  constraint?: string;
}

/** Streamed events for one backlink job. */
export type BacklinksEvent =
  | { jobId: string; type: 'plan'; groups: BacklinkGroupRef[] }
  | ({ jobId: string; type: 'group' } & BacklinkGroupRef & {
        count: number;
        rows: CellValue[][];
        fields: FieldInfo[];
        truncated: boolean;
        error?: PgErrorInfo;
      })
  | { jobId: string; type: 'done' | 'cancelled' };
