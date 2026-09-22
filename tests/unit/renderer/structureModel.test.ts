import { describe, expect, it } from 'vitest';
import type { ColumnInfo, ConstraintInfo, RelationNode } from '../../../src/shared/types/catalog';
import {
  columnBadges,
  ddlKindFor,
  fkTargets,
  groupConstraints,
  kindLabel,
  partitionClause,
  referencedBy
} from '../../../src/renderer/src/tabs/TableStructureTab/structureModel';

const col = (over: Partial<ColumnInfo>): ColumnInfo => ({
  name: 'c',
  ordinal: 1,
  dataType: 'text',
  nullable: true,
  default: null,
  generated: null,
  identity: null,
  isPk: false,
  isFk: false,
  isUnique: false,
  comment: null,
  ...over
});
const con = (over: Partial<ConstraintInfo>): ConstraintInfo => ({ name: 'k', type: 'c', definition: 'CHECK (true)', columns: [], ...over });
const fk: ConstraintInfo = con({ name: 'order_customer_fk', type: 'f', columns: ['customer_id'], refSchema: 'sales', refTable: 'sales_customer', refColumns: ['id'], onDelete: 'cascade' });
const rel = (schema: string, name: string, constraints: ConstraintInfo[]): Pick<RelationNode, 'schema' | 'name' | 'constraints'> => ({ schema, name, constraints });

describe('groupConstraints', () => {
  it('splits by contype in a stable order', () => {
    const g = groupConstraints([con({ type: 'u', name: 'u1' }), fk, con({ type: 'p', name: 'pk' }), con({ type: 'x', name: 'x1' }), con({ type: 'c', name: 'c1' })]);
    expect(g.primary.map((c) => c.name)).toEqual(['pk']);
    expect(g.foreign.map((c) => c.name)).toEqual(['order_customer_fk']);
    expect(g.unique.map((c) => c.name)).toEqual(['u1']);
    expect(g.check.map((c) => c.name)).toEqual(['c1']);
    expect(g.exclusion.map((c) => c.name)).toEqual(['x1']);
  });
  it('handles undefined', () => {
    expect(groupConstraints(undefined).primary).toEqual([]);
  });
});

describe('columnBadges', () => {
  it('orders pk, fk, unique, generated, identity', () => {
    expect(columnBadges(col({ isPk: true, isUnique: true, generated: 'stored', identity: 'always' }))).toEqual(['pk', 'generated', 'identity-always']);
    expect(columnBadges(col({ isFk: true, isUnique: true, identity: 'by default' }))).toEqual(['fk', 'unique', 'identity-default']);
    expect(columnBadges(col({}))).toEqual([]);
  });
});

describe('fkTargets / referencedBy', () => {
  it('extracts outgoing FK edges with actions', () => {
    const t = fkTargets([fk, con({ type: 'f', name: 'broken' })]);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ constraint: 'order_customer_fk', schema: 'sales', table: 'sales_customer', columns: ['customer_id'], refColumns: ['id'], onDelete: 'cascade' });
    expect(t[0]).not.toHaveProperty('onUpdate');
  });
  it('finds incoming FKs sorted by table then constraint', () => {
    const links = referencedBy(
      [
        rel('billing', 'invoice', [con({ name: 'inv_cust', type: 'f', columns: ['cust'], refSchema: 'sales', refTable: 'sales_customer', refColumns: ['id'] })]),
        rel('sales', 'sales_order', [fk, con({ name: 'other', type: 'f', columns: ['x'], refSchema: 'sales', refTable: 'other_table', refColumns: ['id'] })]),
        rel('sales', 'sales_customer', [con({ type: 'p', name: 'pk', columns: ['id'] })])
      ],
      'sales',
      'sales_customer'
    );
    expect(links.map((l) => `${l.schema}.${l.table}:${l.constraint}`)).toEqual(['billing.invoice:inv_cust', 'sales.sales_order:order_customer_fk']);
    expect(links[1]?.columns).toEqual(['customer_id']);
  });
});

describe('labels and helpers', () => {
  it('maps kinds', () => {
    expect(kindLabel('matview')).toBe('materialized view');
    expect(ddlKindFor('partitionedTable')).toBe('table');
    expect(ddlKindFor('view')).toBe('view');
    expect(ddlKindFor('matview')).toBe('matview');
  });
  it('extracts the partition clause', () => {
    expect(partitionClause('CREATE TABLE a.b (\n id int\n) PARTITION BY RANGE (created_at);')).toBe('PARTITION BY RANGE (created_at)');
    expect(partitionClause('CREATE TABLE a.b (id int);')).toBeNull();
    expect(partitionClause(null)).toBeNull();
  });
});
