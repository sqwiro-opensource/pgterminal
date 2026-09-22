import type { ColumnInfo, ConstraintInfo, RelationNode } from '@shared/types/catalog';

/** Constraint groups in display order. */
export interface ConstraintGroups {
  primary: ConstraintInfo[];
  foreign: ConstraintInfo[];
  unique: ConstraintInfo[];
  check: ConstraintInfo[];
  exclusion: ConstraintInfo[];
}

export const CONSTRAINT_GROUP_LABELS: Record<keyof ConstraintGroups, string> = {
  primary: 'Primary key',
  foreign: 'Foreign keys',
  unique: 'Unique',
  check: 'Check',
  exclusion: 'Exclusion'
};

/** Splits constraints by contype in a stable order (pg letters p/f/u/c/x). */
export function groupConstraints(constraints: readonly ConstraintInfo[] | undefined): ConstraintGroups {
  const g: ConstraintGroups = { primary: [], foreign: [], unique: [], check: [], exclusion: [] };
  for (const c of constraints ?? []) {
    switch (c.type) {
      case 'p':
        g.primary.push(c);
        break;
      case 'f':
        g.foreign.push(c);
        break;
      case 'u':
        g.unique.push(c);
        break;
      case 'c':
        g.check.push(c);
        break;
      case 'x':
        g.exclusion.push(c);
        break;
    }
  }
  return g;
}

export type ColumnBadge = 'pk' | 'fk' | 'unique' | 'generated' | 'identity-always' | 'identity-default';

/** Small badges shown next to a column; order is stable for rendering. */
export function columnBadges(col: ColumnInfo): ColumnBadge[] {
  const out: ColumnBadge[] = [];
  if (col.isPk) out.push('pk');
  if (col.isFk) out.push('fk');
  if (col.isUnique && !col.isPk) out.push('unique');
  if (col.generated === 'stored') out.push('generated');
  if (col.identity === 'always') out.push('identity-always');
  else if (col.identity === 'by default') out.push('identity-default');
  return out;
}

/** A foreign-key edge from this relation to another. */
export interface FkTarget {
  constraint: string;
  columns: string[];
  schema: string;
  table: string;
  refColumns: string[];
  onUpdate?: string;
  onDelete?: string;
}

/** Outgoing FK edges (only FKs with a resolvable target). */
export function fkTargets(constraints: readonly ConstraintInfo[] | undefined): FkTarget[] {
  const out: FkTarget[] = [];
  for (const c of constraints ?? []) {
    if (c.type !== 'f' || !c.refSchema || !c.refTable) continue;
    out.push({
      constraint: c.name,
      columns: c.columns,
      schema: c.refSchema,
      table: c.refTable,
      refColumns: c.refColumns ?? [],
      ...(c.onUpdate ? { onUpdate: c.onUpdate } : {}),
      ...(c.onDelete ? { onDelete: c.onDelete } : {})
    });
  }
  return out;
}

/** An incoming FK edge: `schema.table.columns` points at `refColumns` of the inspected relation. */
export interface Backlink {
  schema: string;
  table: string;
  constraint: string;
  columns: string[];
  refColumns: string[];
}

/** Relations whose FKs point at `schema.table`. Input is any set of loaded relation nodes. */
export function referencedBy(
  relations: readonly Pick<RelationNode, 'schema' | 'name' | 'constraints'>[],
  schema: string,
  table: string
): Backlink[] {
  const out: Backlink[] = [];
  for (const rel of relations) {
    for (const c of rel.constraints ?? []) {
      if (c.type !== 'f' || c.refSchema !== schema || c.refTable !== table) continue;
      out.push({ schema: rel.schema, table: rel.name, constraint: c.name, columns: c.columns, refColumns: c.refColumns ?? [] });
    }
  }
  return out.sort((a, b) => `${a.schema}.${a.table}`.localeCompare(`${b.schema}.${b.table}`) || a.constraint.localeCompare(b.constraint));
}

/** Human label for a relation kind badge. */
export function kindLabel(kind: RelationNode['kind']): string {
  switch (kind) {
    case 'table':
      return 'table';
    case 'view':
      return 'view';
    case 'matview':
      return 'materialized view';
    case 'foreignTable':
      return 'foreign table';
    case 'partitionedTable':
      return 'partitioned table';
  }
}

/** DDL kind for ddl:get given a relation kind. */
export function ddlKindFor(kind: RelationNode['kind']): 'table' | 'view' | 'matview' {
  if (kind === 'view') return 'view';
  if (kind === 'matview') return 'matview';
  return 'table';
}

/** `PARTITION BY …` clause when present in a DDL script, else null. */
export function partitionClause(ddl: string | null | undefined): string | null {
  if (!ddl) return null;
  const m = /PARTITION BY\s+[A-Z]+\s*\([^)]*\)/i.exec(ddl);
  return m ? m[0] : null;
}
