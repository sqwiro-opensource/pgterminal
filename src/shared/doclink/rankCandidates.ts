import type { CompletionIndex } from '../types/catalog';
import type { DocRef, DocTarget, DocTargetReason } from '../types/doclink';

/** Relation kinds that can be link targets. */
const TARGET_KINDS = new Set(['table', 'partitionedTable', 'matview', 'view', 'foreignTable']);

const RANK: Record<DocTargetReason, number> = {
  explicit: 0,
  prefixedName: 1,
  strippedName: 2,
  searchPath: 3,
  anySchema: 4
};

function relationSet(index: CompletionIndex): { has(schema: string, table: string): boolean; schemas: string[]; bySchema: Map<string, Set<string>> } {
  const bySchema = new Map<string, Set<string>>();
  for (const r of index.relations) {
    if (!TARGET_KINDS.has(r.kind)) continue;
    let set = bySchema.get(r.schema);
    if (!set) {
      set = new Set();
      bySchema.set(r.schema, set);
    }
    set.add(r.name);
  }
  return {
    has: (schema, table) => bySchema.get(schema)?.has(table) ?? false,
    schemas: [...bySchema.keys()],
    bySchema
  };
}

/**
 * Orders every relation that could be the target of `ref`, best first.
 * Rank 0 explicit `schema.table`; 1 `schema_table` prefix convention (longest schema first);
 * 2 same prefix with the prefix stripped; 3 search_path lookup; 4 any other schema.
 * Duplicates (same schema+table) keep their best rank. Output sorted by rank; within a rank the
 * order is longest schema prefix first (ranks 1–2), search_path order (3), alphabetical (4).
 */
export function rankCandidates(ref: DocRef, index: CompletionIndex): DocTarget[] {
  const rels = relationSet(index);
  const seen = new Map<string, DocTarget>();
  const add = (schema: string, table: string, reason: DocTargetReason): void => {
    const id = `${schema}.${table}`;
    if (seen.has(id)) return;
    seen.set(id, { schema, table, keyColumn: '', keyValue: ref.key, rank: RANK[reason], reason });
  };

  if (ref.schemaHint && rels.has(ref.schemaHint, ref.table)) add(ref.schemaHint, ref.table, 'explicit');

  const prefixSchemas = rels.schemas
    .filter((s) => ref.table.startsWith(`${s}_`) && ref.table.length > s.length + 1)
    .sort((a, b) => b.length - a.length || a.localeCompare(b));
  for (const s of prefixSchemas) if (rels.has(s, ref.table)) add(s, ref.table, 'prefixedName');
  for (const s of prefixSchemas) {
    const stripped = ref.table.slice(s.length + 1);
    if (rels.has(s, stripped)) add(s, stripped, 'strippedName');
  }

  const searchPath = [...index.searchPath];
  if (!searchPath.includes('public')) searchPath.push('public');
  for (const s of searchPath) if (rels.has(s, ref.table)) add(s, ref.table, 'searchPath');

  for (const s of [...rels.schemas].sort()) if (rels.has(s, ref.table)) add(s, ref.table, 'anySchema');

  // Stable sort by rank only: insertion order already encodes longest-prefix-first (ranks 1–2),
  // search_path order (rank 3) and alphabetical schemas (rank 4).
  return [...seen.values()].sort((a, b) => a.rank - b.rank);
}

/** True when two or more candidates share the best rank. */
export function isAmbiguous(candidates: readonly DocTarget[]): boolean {
  if (candidates.length < 2) return false;
  const best = candidates[0]?.rank;
  return candidates.filter((c) => c.rank === best).length > 1;
}
