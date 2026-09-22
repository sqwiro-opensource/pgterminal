import format from 'pg-format';
import type { FieldDef } from 'pg';
import type { CompletionIndex } from '@shared/types/catalog';
import type { BacklinkGroupRef, BacklinksEvent, BacklinksRequest, BacklinkVia } from '@shared/types/doclink';
import type { CellValue } from '@shared/types/query';
import type { Queryable } from '@main/catalog/Queryable';
import { fksReferencing, type FkEntry } from '@main/catalog/fkIndex';
import { toPgErrorInfo } from '@main/db/pgError';
import { resolveFieldInfos } from '@main/db/typeNames';
import { referenceForms } from './forms';

export { referenceForms };

export interface BacklinkDeps {
  pool: Queryable;
  index: CompletionIndex;
  fkIndex: readonly FkEntry[];
}

export interface CancelSignal {
  cancelled: boolean;
}

const TEXT_TYPES = new Set(['text', 'varchar', 'character varying', 'bpchar', 'character', 'citext', 'name']);
const JSON_TYPES = new Set(['jsonb', 'json']);
const TEXT_ARRAY_TYPES = new Set(['text[]', '_text', 'varchar[]', '_varchar', 'character varying[]', 'citext[]', '_citext']);

/** Classify a column type into a backlink scan strategy, or null when it cannot hold a reference. */
export function viaForType(dataType: string): Exclude<BacklinkVia, 'fk'> | null {
  const t = dataType.toLowerCase().replace(/\(.*\)/, '').trim();
  if (JSON_TYPES.has(t)) return 'jsonb';
  if (TEXT_ARRAY_TYPES.has(t)) return 'array';
  if (TEXT_TYPES.has(t)) return 'text';
  return null;
}

/** Build the ordered plan: FK groups first, then value-scan columns within scope. */
export function planGroups(req: BacklinksRequest, deps: Pick<BacklinkDeps, 'index' | 'fkIndex'>): BacklinkGroupRef[] {
  const { target, scope } = req;
  const groups: BacklinkGroupRef[] = [];
  for (const fk of fksReferencing(deps.fkIndex, target.schema, target.table)) {
    groups.push({ via: 'fk', schema: fk.schema, table: fk.table, column: fk.columns.join(','), constraint: fk.constraint });
  }
  if (scope.mode === 'fkOnly') return groups;
  const inScope = (schema: string, table: string): boolean => {
    if (scope.mode === 'wholeDb') return true;
    if (scope.mode === 'sameSchema') return schema === target.schema;
    return (scope.tables ?? []).some((t) => t.schema === schema && t.table === table);
  };
  const scannable = deps.index.relations
    .filter((r) => (r.kind === 'table' || r.kind === 'partitionedTable' || r.kind === 'matview') && inScope(r.schema, r.name))
    .sort((a, b) => Number(b.schema === target.schema) - Number(a.schema === target.schema) || a.schema.localeCompare(b.schema) || a.name.localeCompare(b.name));
  for (const rel of scannable) {
    for (const col of rel.columns) {
      // The document's own key column (e.g. `_id`) is not a reference to itself.
      if (rel.schema === target.schema && rel.name === target.table && col.name === target.keyColumn) continue;
      const via = viaForType(col.type);
      if (via) groups.push({ via, schema: rel.schema, table: rel.name, column: col.name });
    }
  }
  return groups;
}

function groupSql(g: BacklinkGroupRef, forms: string[], limit: number, fk?: FkEntry): { text: string; values: unknown[] } {
  const n = limit + 1;
  switch (g.via) {
    case 'fk': {
      if (!fk) throw new Error('fk entry missing');
      const cols = fk.columns.map((c) => format('%I', c)).join(', ');
      const params = fk.columns.map((_, i) => `$${i + 1}`).join(', ');
      return { text: `SELECT * FROM ${format('%I.%I', g.schema, g.table)} WHERE (${cols}) = (${params}) LIMIT ${n}`, values: [] };
    }
    case 'text':
      return { text: `SELECT * FROM ${format('%I.%I', g.schema, g.table)} WHERE ${format('%I', g.column)} = ANY($1::text[]) LIMIT ${n}`, values: [forms] };
    case 'array':
      return { text: `SELECT * FROM ${format('%I.%I', g.schema, g.table)} WHERE ${format('%I', g.column)}::text[] && $1::text[] LIMIT ${n}`, values: [forms] };
    case 'jsonb': {
      const col = `${format('%I', g.column)}::jsonb`;
      const preds = forms.map((_, i) => `jsonb_path_exists(${col}, '$.** ? (@ == $ref)', jsonb_build_object('ref', $${i + 1}::text))`).join(' OR ');
      return { text: `SELECT * FROM ${format('%I.%I', g.schema, g.table)} WHERE ${preds} LIMIT ${n}`, values: forms };
    }
  }
}

/**
 * Streams backlink groups for one document. Emits `plan` first, then one `group` per planned entry
 * (in order, each inside a read-only transaction with SET LOCAL statement_timeout), then `done`
 * or `cancelled`. Errors (including timeouts) are reported on the group and never abort the job.
 */
export async function findBacklinks(
  req: BacklinksRequest,
  deps: BacklinkDeps,
  emit: (e: BacklinksEvent) => void,
  signal: CancelSignal
): Promise<void> {
  const { jobId, target } = req;
  const limit = Math.max(1, req.perTableLimit || 50);
  const timeoutMs = Math.max(1, req.perQueryTimeoutMs || 5000);
  const groups = planGroups(req, deps);
  emit({ jobId, type: 'plan', groups });
  const forms = referenceForms(target);

  for (const g of groups) {
    if (signal.cancelled) {
      emit({ jobId, type: 'cancelled' });
      return;
    }
    const fk = g.via === 'fk' ? deps.fkIndex.find((f) => f.constraint === g.constraint && f.schema === g.schema && f.table === g.table) : undefined;
    let values: unknown[] = [];
    let text = '';
    try {
      const built = groupSql(g, forms, limit, fk);
      text = built.text;
      values = g.via === 'fk' ? fk!.refColumns.map((c) => req.row[c] ?? null) : built.values;
      if (g.via === 'fk' && values.some((v) => v === null || v === undefined)) {
        emit({ jobId, type: 'group', ...g, count: 0, rows: [], fields: [], truncated: false });
        continue;
      }
      await deps.pool.query('BEGIN READ ONLY');
      try {
        await deps.pool.query(`SET LOCAL statement_timeout = ${Math.floor(timeoutMs)}`);
        const r = await deps.pool.query<CellValue[]>({ text, values, rowMode: 'array' } as never);
        const rows = r.rows.slice(0, limit);
        const fields = await resolveFieldInfos(null, (r.fields ?? []) as FieldDef[]);
        emit({ jobId, type: 'group', ...g, count: rows.length, rows, fields, truncated: r.rows.length > limit });
      } finally {
        await deps.pool.query('ROLLBACK').catch(() => undefined);
      }
    } catch (err) {
      emit({ jobId, type: 'group', ...g, count: 0, rows: [], fields: [], truncated: false, error: toPgErrorInfo(err, text) });
    }
  }
  emit({ jobId, type: signal.cancelled ? 'cancelled' : 'done' });
}
