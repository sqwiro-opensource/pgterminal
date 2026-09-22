import format from 'pg-format';
import type { FieldDef } from 'pg';
import type { CompletionIndex, ColumnInfo } from '@shared/types/catalog';
import type { DocLinkResolution, DocTarget, ResolveDocLinkRequest } from '@shared/types/doclink';
import type { CellValue } from '@shared/types/query';
import { parseDocRef } from '@shared/doclink/parseDocRef';
import { isAmbiguous, rankCandidates } from '@shared/doclink/rankCandidates';
import type { Queryable } from '@main/catalog/Queryable';
import { resolveFieldInfos } from '@main/db/typeNames';
import { referenceForms } from './forms';

export interface ResolverDeps {
  pool: Queryable;
  index: CompletionIndex;
  /** Columns of a relation (from the catalog service); empty when unknown. */
  columnsOf(schema: string, table: string): Promise<ColumnInfo[]>;
}

const INT_TYPES = /^(int2|int4|int8|smallint|integer|bigint|serial|bigserial|smallserial|oid)$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a key string can be compared against a column of the given type. */
export function keyFitsType(dataType: string, key: string): boolean {
  const t = dataType.toLowerCase();
  if (INT_TYPES.test(t)) return /^-?\d+$/.test(key);
  if (t === 'uuid') return UUID_RE.test(key);
  return true;
}

/**
 * Picks the column to compare against and the candidate values.
 * `_id` (fleet convention) → full raw strings; else single-column PK; else `id`; composite PK → null.
 */
export function pickKeyColumn(
  columns: readonly ColumnInfo[],
  ref: { raw: string; table: string; key: string; schemaHint: string | null },
  candidate: { schema: string; table: string }
): { column: string; values: string[] } | null {
  const idCol = columns.find((c) => c.name === '_id');
  if (idCol) {
    // `_id` holds `schema_table/key` by convention; also accept the raw text and the candidate's own forms.
    const values = new Set<string>([ref.raw, `${ref.table}/${ref.key}`, ...referenceForms({ ...candidate, keyValue: ref.key })]);
    return { column: '_id', values: [...values] };
  }
  const pks = columns.filter((c) => c.isPk);
  if (pks.length === 1) {
    const pk = pks[0]!;
    return keyFitsType(pk.dataType, ref.key) ? { column: pk.name, values: [ref.key] } : null;
  }
  if (pks.length > 1) return null;
  const id = columns.find((c) => c.name === 'id');
  if (id) return keyFitsType(id.dataType, ref.key) ? { column: 'id', values: [ref.key] } : null;
  return null;
}

/** Resolve a `[schema.]table/key` reference to a row. Never throws for user input; SQL errors propagate. */
export async function resolveDocLink(req: ResolveDocLinkRequest, deps: ResolverDeps): Promise<DocLinkResolution> {
  const ref = parseDocRef(req.ref?.raw);
  if (!ref) return { status: 'invalid', reason: `not a document reference: ${String(req.ref?.raw ?? '')}` };

  let candidates = rankCandidates(ref, deps.index);
  if (candidates.length === 0) return { status: 'notFound', candidates: [] };

  if (req.preferred) {
    const i = candidates.findIndex((c) => c.schema === req.preferred!.schema && c.table === req.preferred!.table);
    if (i > 0) candidates = [candidates[i]!, ...candidates.slice(0, i), ...candidates.slice(i + 1)];
  } else if (isAmbiguous(candidates)) {
    return { status: 'ambiguous', candidates };
  }

  const tried: DocTarget[] = [];
  for (const cand of candidates) {
    const columns = await deps.columnsOf(cand.schema, cand.table);
    const pick = pickKeyColumn(columns, ref, cand);
    if (!pick) continue;
    const target: DocTarget = { ...cand, keyColumn: pick.column, keyValue: pick.values[0] ?? ref.key };
    tried.push(target);
    const sql = format('SELECT * FROM %I.%I WHERE %I::text = ANY($1::text[]) LIMIT 2', cand.schema, cand.table, pick.column);
    const r = await deps.pool.query<Record<string, CellValue>>(sql, [pick.values]);
    if (r.rows.length === 1) {
      const fields = await resolveFieldInfos(null, (r.fields ?? []) as FieldDef[]);
      return { status: 'found', target, row: r.rows[0]!, fields };
    }
    if (r.rows.length > 1) return { status: 'ambiguous', candidates: [target] };
  }
  return { status: 'notFound', candidates: tried.length ? tried : candidates };
}
