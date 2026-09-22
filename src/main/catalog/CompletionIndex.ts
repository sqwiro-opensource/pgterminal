import type { CompletionIndex } from '@shared/types/catalog';
import { completionIndexSql, parseSearchPath, serverInfoSql } from './sql';
import type { Queryable } from './Queryable';

const RELKIND_TO_KIND: Record<string, string> = {
  r: 'table',
  p: 'partitionedTable',
  v: 'view',
  m: 'matview',
  f: 'foreignTable'
};

interface IndexRow {
  schema: string;
  name: string;
  relkind: string;
  columns: Array<{ name: string; type: string; isPk: boolean }>;
}

/** Builds the flat relation/column index used by Monaco completion and document-link ranking. */
export async function buildCompletionIndex(
  pool: Queryable,
  opts: { showInternal?: boolean } = {}
): Promise<CompletionIndex> {
  const [rels, info] = await Promise.all([
    pool.query<IndexRow>(completionIndexSql(opts.showInternal ?? false).text, completionIndexSql(opts.showInternal ?? false).values),
    pool.query<{ search_path: string; current_user: string }>(serverInfoSql().text, serverInfoSql().values)
  ]);
  const infoRow = info.rows[0];
  const searchPath = infoRow ? parseSearchPath(infoRow.search_path, infoRow.current_user) : ['public'];
  return {
    searchPath,
    relations: rels.rows.map((r) => ({
      schema: r.schema,
      name: r.name,
      kind: RELKIND_TO_KIND[r.relkind] ?? r.relkind,
      columns: r.columns
    })),
    builtAt: Date.now()
  };
}
