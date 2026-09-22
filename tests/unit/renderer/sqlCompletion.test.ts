import { describe, expect, it } from 'vitest';
import type { CompletionIndex } from '../../../src/shared/types/catalog';
import { analyzeSqlContext } from '../../../src/renderer/src/features/editor/sqlContext';
import { buildCompletions, lookupColumnType, resolveRelation } from '../../../src/renderer/src/features/editor/sqlCompletion';

const index: CompletionIndex = {
  searchPath: ['pgterminal', 'public'],
  builtAt: 0,
  relations: [
    { schema: 'sales', name: 'sales_customer', kind: 'table', columns: [{ name: 'name', type: 'text', isPk: false }, { name: 'id', type: 'integer', isPk: true }] },
    { schema: 'public', name: 'users', kind: 'table', columns: [{ name: 'id', type: 'uuid', isPk: true }] },
    { schema: 'a', name: 'dup', kind: 'table', columns: [{ name: 'id', type: 'integer', isPk: true }] },
    { schema: 'b', name: 'dup', kind: 'table', columns: [{ name: 'id', type: 'integer', isPk: true }] },
    { schema: 'sales', name: 'customer', kind: 'view', columns: [{ name: 'id', type: 'integer', isPk: false }] }
  ]
};

function at(sql: string): [string, number] {
  const i = sql.indexOf('|');
  return [sql.slice(0, i) + sql.slice(i + 1), i];
}

describe('resolveRelation', () => {
  it('uses explicit schema, then search_path, then the schema_table prefix rule, then uniqueness', () => {
    expect(resolveRelation(index, 'dup', 'b')?.schema).toBe('b');
    expect(resolveRelation(index, 'users')?.schema).toBe('public');
    expect(resolveRelation(index, 'sales_customer')?.schema).toBe('sales');
    expect(resolveRelation(index, 'dup')).toBeNull();
    expect(resolveRelation(index, 'customer')?.schema).toBe('sales');
  });
});

describe('buildCompletions', () => {
  it('alias. → columns of the resolved table, pk first', () => {
    const items = buildCompletions(analyzeSqlContext(...at('SELECT * FROM sales_customer c WHERE c.|')), index);
    expect(items.map((i) => i.label)).toEqual(['name', 'id']);
    const sorted = [...items].sort((x, y) => x.sortText.localeCompare(y.sortText));
    expect(sorted[0]?.label).toBe('id');
    expect(items.every((i) => i.kind === 'column')).toBe(true);
  });
  it('FROM → unqualified search_path tables plus qualified names for everything, plus schemas', () => {
    const items = buildCompletions(analyzeSqlContext(...at('SELECT * FROM |')), index);
    const labels = items.map((i) => i.label);
    expect(labels).toContain('users');
    expect(labels).toContain('sales.sales_customer');
    expect(labels).not.toContain('sales_customer');
    expect(items.find((i) => i.label === 'sales.customer')?.kind).toBe('view');
    expect(items.filter((i) => i.kind === 'schema').map((i) => i.label)).toEqual(['a', 'b', 'public', 'sales']);
  });
  it('schema. → tables of that schema; unresolvable qualifier → nothing', () => {
    expect(buildCompletions(analyzeSqlContext(...at('SELECT * FROM sales.|')), index).map((i) => i.label)).toEqual(['sales_customer', 'customer']);
    expect(buildCompletions(analyzeSqlContext(...at('SELECT dup.| FROM dup')), index)).toEqual([]);
  });
  it('column context qualifies inserts only with two or more tables', () => {
    const one = buildCompletions(analyzeSqlContext(...at('SELECT | FROM sales_customer')), index);
    expect(one.find((i) => i.label === 'id')?.insertText).toBe('id');
    const two = buildCompletions(analyzeSqlContext(...at('SELECT | FROM sales_customer c JOIN users u ON true')), index);
    expect(two.filter((i) => i.kind === 'column').map((i) => i.insertText)).toEqual(['c.name', 'c.id', 'u.id']);
    expect(two.some((i) => i.kind === 'keyword')).toBe(true);
  });
  it('keyword mode returns keywords, functions, snippets and types; LIMIT returns nothing', () => {
    const items = buildCompletions(analyzeSqlContext(...at('|')), index);
    const kinds = new Set(items.map((i) => i.kind));
    expect(kinds).toEqual(new Set(['keyword', 'function', 'snippet', 'type']));
    expect(items.find((i) => i.label === 'COUNT')?.insertText).toBe('COUNT(${1:*})');
    expect(items.find((i) => i.label === 'SELECT … FROM … WHERE')?.isSnippet).toBe(true);
    expect(buildCompletions(analyzeSqlContext(...at('SELECT 1 LIMIT |')), index)).toEqual([]);
  });
  it('quotes identifiers that need it', () => {
    const idx: CompletionIndex = { ...index, relations: [{ schema: 'public', name: 'Weird Name', kind: 'table', columns: [{ name: 'a"b', type: 'int', isPk: false }] }] };
    const items = buildCompletions(analyzeSqlContext(...at('SELECT * FROM |')), idx);
    expect(items.find((i) => i.label === 'Weird Name')?.insertText).toBe('"Weird Name"');
    const cols = buildCompletions(analyzeSqlContext(...at('SELECT "Weird Name".| FROM "Weird Name"')), idx);
    expect(cols[0]?.insertText).toBe('"a""b"');
  });
});

describe('lookupColumnType', () => {
  it('finds the column type through an alias or unqualified', () => {
    const ctx = analyzeSqlContext(...at('SELECT c.id FROM sales_customer c WHERE |'));
    expect(lookupColumnType(ctx, index, 'id', 'c')).toBe('integer (primary key) — sales.sales_customer');
    expect(lookupColumnType(ctx, index, 'name')).toBe('text — sales.sales_customer');
    expect(lookupColumnType(ctx, index, 'nope')).toBeNull();
  });
});
