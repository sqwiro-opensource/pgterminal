import type { CellValue, FieldInfo } from '@shared/types/query';

export type FkColumns = Record<string, { schema: string; table: string }>;

/** Column → FK target for sole-column FK columns; empty when the derived-chip setting is off. */
export function deriveFkChips(fields: FieldInfo[], fkColumns: FkColumns | undefined, enabled: boolean): FkColumns {
  if (!enabled || !fkColumns) return {};
  const out: FkColumns = {};
  for (const f of fields) {
    const t = fkColumns[f.name];
    if (t) out[f.name] = t;
  }
  return out;
}

/** Raw reference text for a derived chip: `table/value` (the resolver handles schema lookup). */
export function fkChipRaw(target: { schema: string; table: string }, value: CellValue): string | null {
  if (value === null || value === undefined || typeof value === 'object') return null;
  const v = String(value);
  if (v === '' || /\s|\//.test(v)) return null;
  return `${target.schema}.${target.table}/${v}`;
}
