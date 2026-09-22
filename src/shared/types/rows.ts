import type { CellValue, FieldInfo, JsonValue, PgErrorInfo } from './query';

/** Filter operators supported by rows:fetch. `raw` is a user SQL fragment. */
export type FilterOp =
  | 'eq'
  | 'neq'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'like'
  | 'ilike'
  | 'in'
  | 'isNull'
  | 'isNotNull'
  | 'contains'
  | 'raw';

/** One filter clause; clauses are ANDed. */
export interface Filter {
  column: string;
  op: FilterOp;
  value?: JsonValue;
}

/** Sort clause. */
export interface Sort {
  column: string;
  dir: 'asc' | 'desc';
  nullsFirst?: boolean;
}

/** Page selector: offset, or keyset relative to a boundary row. */
export type PageSpec =
  | { mode: 'offset'; offset: number }
  | { mode: 'keyset'; after: Record<string, CellValue> | null; before?: Record<string, CellValue> | null };

/** Request for a page of table rows built server-side with parameters. */
export interface FetchRowsRequest {
  connectionId: string;
  database: string;
  schema: string;
  table: string;
  columns?: string[];
  filters: Filter[];
  sort: Sort[];
  limit: number;
  page: PageSpec;
}

/** A page of rows. */
export interface RowsPage {
  fields: FieldInfo[];
  rows: CellValue[][];
  pkColumns: string[];
  hasMore: boolean;
  /** The generated SQL, for display. */
  sqlText: string;
  durationMs: number;
}

/** Request for rows:count. */
export interface CountRequest {
  connectionId: string;
  database: string;
  schema: string;
  table: string;
  filters: Filter[];
  exact: boolean;
}

/** Estimate (reltuples) plus optional exact count, both as strings. */
export interface CountResult {
  estimate: string;
  exact: string | null;
}

/** One row mutation addressed by full primary key. */
export type RowOp =
  | { op: 'update'; pk: Record<string, CellValue>; set: Record<string, CellValue> }
  | { op: 'insert'; values: Record<string, CellValue> }
  | { op: 'delete'; pk: Record<string, CellValue> };

/** Apply several ops in one transaction; dryRun returns SQL only. */
export interface MutateRowsRequest {
  connectionId: string;
  database: string;
  schema: string;
  table: string;
  ops: RowOp[];
  dryRun?: boolean;
}

/** Outcome of rows:mutate. */
export interface MutateRowsResult {
  ok: boolean;
  sqlText: string;
  results?: Array<{ rowCount: number; returning?: CellValue[][]; fields?: FieldInfo[] }>;
  error?: PgErrorInfo & { opIndex: number };
}
