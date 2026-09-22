import type { QueryResult, QueryResultRow } from 'pg';

/** The slice of pg.Pool the catalog needs. Lets tests wrap a pool to count queries. */
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

/** Whoever owns the pools (the ConnectionRegistry in production). */
export interface PoolProvider {
  getPool(connectionId: string, database: string): Queryable | Promise<Queryable>;
}
