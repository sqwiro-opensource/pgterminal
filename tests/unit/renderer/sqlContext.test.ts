import { describe, expect, it } from 'vitest';
import { analyzeSqlContext, collectTableRefs, tokenize } from '../../../src/renderer/src/features/editor/sqlContext';

/** Place the cursor at the `|` marker. */
function at(sql: string): [string, number] {
  const i = sql.indexOf('|');
  if (i < 0) throw new Error('no cursor marker');
  return [sql.slice(0, i) + sql.slice(i + 1), i];
}

describe('tokenize', () => {
  it('skips comments and keeps strings/dollar quotes opaque', () => {
    const t = tokenize(`SELECT 'a;b', $$x; y$$ -- c\nFROM /* z */ "Weird Name" WHERE n = $1`);
    expect(t.map((x) => x.type)).toEqual([
      'ident', 'string', 'punct', 'string', 'ident', 'ident', 'ident', 'ident', 'punct', 'param'
    ]);
    const weird = t.find((x) => x.quoted);
    expect(weird?.value).toBe('Weird Name');
  });
});

describe('collectTableRefs', () => {
  it('collects FROM lists, joins with aliases, schema-qualified names and quoted identifiers', () => {
    const refs = collectTableRefs(
      tokenize(`SELECT * FROM sales.sales_customer AS sc, auth.auth_user u JOIN "Weird Name" w ON w.id = u.id WHERE 1=1`)
    );
    expect(refs).toEqual([
      { schema: 'sales', table: 'sales_customer', alias: 'sc' },
      { schema: 'auth', table: 'auth_user', alias: 'u' },
      { table: 'Weird Name', alias: 'w' }
    ]);
  });
  it('skips subqueries and function calls, handles UPDATE/INSERT INTO/DELETE FROM', () => {
    expect(collectTableRefs(tokenize(`SELECT * FROM (SELECT 1) s, generate_series(1,3) g, users`))).toEqual([{ table: 'users' }]);
    expect(collectTableRefs(tokenize(`UPDATE sales_customer SET name = 'x' WHERE id = 1`))).toEqual([{ table: 'sales_customer' }]);
    expect(collectTableRefs(tokenize(`INSERT INTO auth.auth_user (id) VALUES (1)`))).toEqual([{ schema: 'auth', table: 'auth_user' }]);
    expect(collectTableRefs(tokenize(`DELETE FROM users WHERE id = 1`))).toEqual([{ table: 'users' }]);
  });
});

describe('analyzeSqlContext', () => {
  it('afterDot with an alias resolves the alias to its table', () => {
    const ctx = analyzeSqlContext(...at('SELECT c.| FROM sales_customer c'));
    expect(ctx.kind).toBe('afterDot');
    expect(ctx.qualifier).toBe('c');
    expect(ctx.aliases['c']).toEqual({ table: 'sales_customer' });
    expect(ctx.prefix).toBe('');
  });
  it('afterDot with schema-qualified refs and a prefix being typed', () => {
    const ctx = analyzeSqlContext(...at('FROM sales.sales_customer AS sc JOIN auth.auth_user u ON u.id = sc.na| '));
    expect(ctx.kind).toBe('afterDot');
    expect(ctx.qualifier).toBe('sc');
    expect(ctx.prefix).toBe('na');
    expect(ctx.aliases['sc']).toEqual({ schema: 'sales', table: 'sales_customer' });
    expect(ctx.aliases['u']).toEqual({ schema: 'auth', table: 'auth_user' });
  });
  it('afterFrom directly after FROM/JOIN and after a comma in the FROM list', () => {
    expect(analyzeSqlContext(...at('SELECT * FROM |')).kind).toBe('afterFrom');
    expect(analyzeSqlContext(...at('SELECT * FROM a JOIN |')).kind).toBe('afterFrom');
    expect(analyzeSqlContext(...at('SELECT * FROM a, |')).kind).toBe('afterFrom');
    expect(analyzeSqlContext(...at('SELECT * FROM sal|')).kind).toBe('afterFrom');
  });
  it('column context inside SELECT/WHERE with a table in scope; keyword when nothing is in scope', () => {
    const ctx = analyzeSqlContext(...at('SELECT |, name FROM sales_customer'));
    expect(ctx.kind).toBe('column');
    expect(ctx.tablesInScope).toEqual([{ table: 'sales_customer' }]);
    expect(analyzeSqlContext(...at('SELECT * FROM sales_customer c WHERE c.id = 1 AND |')).kind).toBe('column');
    expect(analyzeSqlContext(...at('SELECT |')).kind).toBe('keyword');
    expect(analyzeSqlContext(...at('|')).kind).toBe('keyword');
    expect(analyzeSqlContext(...at('SELECT * FROM t LIMIT |')).kind).toBe('none');
  });
  it('INSERT INTO t (col, | is a column context', () => {
    const ctx = analyzeSqlContext(...at('INSERT INTO sales_customer (name, |'));
    expect(ctx.kind).toBe('column');
    expect(ctx.tablesInScope).toEqual([{ table: 'sales_customer' }]);
  });
  it('picks the statement under the cursor in a multi-statement script', () => {
    const ctx = analyzeSqlContext(...at('SELECT * FROM users;\n\nSELECT o.| FROM sales_order o;\nSELECT 1;'));
    expect(ctx.kind).toBe('afterDot');
    expect(ctx.qualifier).toBe('o');
    expect(ctx.tablesInScope).toEqual([{ table: 'sales_order', alias: 'o' }]);
    expect(ctx.statement?.text).toBe('SELECT o. FROM sales_order o');
  });
  it('quoted identifiers keep their case and become qualifiers', () => {
    const ctx = analyzeSqlContext(...at('SELECT "Weird Name".| FROM public."Weird Name"'));
    expect(ctx.kind).toBe('afterDot');
    expect(ctx.qualifier).toBe('Weird Name');
    expect(ctx.aliases['Weird Name']).toEqual({ schema: 'public', table: 'Weird Name' });
  });
});
