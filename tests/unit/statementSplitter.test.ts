import { describe, expect, it } from 'vitest';
import {
  classifyStatement,
  firstKeyword,
  returnsRows,
  splitStatements,
  statementAt
} from '@shared/sql/statementSplitter';

const texts = (sql: string): string[] => splitStatements(sql).map((s) => s.text);

describe('splitStatements', () => {
  it('splits two simple statements', () => {
    expect(texts('SELECT 1; SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('keeps semicolons inside single, double and E strings', () => {
    const sql = `SELECT 'a;b'; SELECT "col;umn" FROM t; SELECT E'x\\';y;z'; SELECT 'it''s; fine';`;
    expect(texts(sql)).toEqual([
      `SELECT 'a;b'`,
      `SELECT "col;umn" FROM t`,
      `SELECT E'x\\';y;z'`,
      `SELECT 'it''s; fine'`
    ]);
  });

  it('keeps semicolons inside $$ and $tag$ dollar quotes', () => {
    const sql = `SELECT $$a;b$$; SELECT $fn$x; $$ y;$fn$; SELECT 1;`;
    expect(texts(sql)).toEqual([`SELECT $$a;b$$`, `SELECT $fn$x; $$ y;$fn$`, `SELECT 1`]);
  });

  it('keeps a plpgsql function body as one statement', () => {
    const fn = `CREATE FUNCTION f() RETURNS int AS $$
BEGIN
  PERFORM 1; -- comment; here
  RETURN 2;
END;
$$ LANGUAGE plpgsql`;
    const sql = `${fn};\nSELECT f();`;
    expect(texts(sql)).toEqual([fn, 'SELECT f()']);
  });

  it('ignores semicolons in -- and nested /* */ comments', () => {
    const sql = `SELECT 1 -- a; b\n; /* x; /* nested; */ y; */ SELECT 2;`;
    expect(texts(sql)).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('skips empty statements and comment-only segments', () => {
    expect(texts(';;SELECT 1;; -- only a comment\n; /* c */ ;')).toEqual(['SELECT 1']);
    expect(splitStatements('')).toEqual([]);
    expect(splitStatements('   \n-- nothing\n')).toEqual([]);
  });

  it('includes a trailing statement without a semicolon', () => {
    expect(texts('SELECT 1;\nSELECT 2')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('round-trips offsets', () => {
    const sql = `  /* lead */ SELECT 'a;' ; -- t\n\n  INSERT INTO t VALUES ($$;$$)  \n;  SELECT 3 /* tail */`;
    for (const s of splitStatements(sql)) {
      expect(sql.slice(s.start, s.end)).toBe(s.text);
    }
    expect(texts(sql)).toEqual([`SELECT 'a;'`, `INSERT INTO t VALUES ($$;$$)`, 'SELECT 3']);
  });

  it('handles unterminated strings and comments without throwing', () => {
    expect(texts(`SELECT 'open; SELECT 2;`)).toEqual([`SELECT 'open; SELECT 2;`]);
    expect(texts(`SELECT 1; /* never closed; SELECT 2;`)).toEqual(['SELECT 1']);
    expect(texts(`SELECT $$never; closed`)).toEqual(['SELECT $$never; closed']);
  });

  it('does not treat $1 parameters or identifier-embedded E as quotes', () => {
    expect(texts(`SELECT $1; SELECT $2 + 1; SELECT tablE'x' FROM t;`)).toEqual([
      'SELECT $1',
      'SELECT $2 + 1',
      `SELECT tablE'x' FROM t`
    ]);
  });

  it('splits 10,000 statements quickly', () => {
    const sql = Array.from({ length: 10_000 }, (_, i) => `INSERT INTO t (a, b) VALUES (${i}, 'v;${i}');`).join('\n');
    const t0 = performance.now();
    const stmts = splitStatements(sql);
    const ms = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`split 10,000 statements in ${ms.toFixed(1)} ms`);
    expect(stmts).toHaveLength(10_000);
    expect(ms).toBeLessThan(200);
  });
});

describe('statementAt', () => {
  const sql = `SELECT 1;\n\nSELECT 2;\n  -- gap\nUPDATE t SET a = 1`;
  it('returns the statement containing the offset', () => {
    expect(statementAt(sql, 3)?.text).toBe('SELECT 1');
    expect(statementAt(sql, sql.indexOf('SELECT 2') + 2)?.text).toBe('SELECT 2');
    expect(statementAt(sql, sql.length)?.text).toBe('UPDATE t SET a = 1');
  });
  it('returns the preceding statement when the offset is in a gap', () => {
    expect(statementAt(sql, sql.indexOf('\n\n') + 1)?.text).toBe('SELECT 1');
    expect(statementAt(sql, sql.indexOf('-- gap'))?.text).toBe('SELECT 2');
  });
  it('returns the first statement for offsets before it and null for empty scripts', () => {
    expect(statementAt('   SELECT 1', 0)?.text).toBe('SELECT 1');
    expect(statementAt('', 0)).toBeNull();
    expect(statementAt('-- only', 3)).toBeNull();
  });
});

describe('classifyStatement / returnsRows', () => {
  it('classifies by first keyword', () => {
    expect(classifyStatement('SELECT 1')).toBe('select');
    expect(classifyStatement('with x as (select 1) select * from x')).toBe('select');
    expect(classifyStatement('EXPLAIN ANALYZE SELECT 1')).toBe('select');
    expect(classifyStatement('INSERT INTO t VALUES (1)')).toBe('dml');
    expect(classifyStatement('UPDATE t SET a = 1')).toBe('dml');
    expect(classifyStatement('CREATE TABLE t (id int)')).toBe('ddl');
    expect(classifyStatement('ALTER TABLE t ADD COLUMN x int')).toBe('ddl');
    expect(classifyStatement('BEGIN')).toBe('tcl');
    expect(classifyStatement('COMMIT;')).toBe('tcl');
    expect(classifyStatement('SET search_path TO sales')).toBe('other');
    expect(classifyStatement('')).toBe('other');
  });
  it('skips leading comments and parentheses', () => {
    expect(classifyStatement('/* c */ -- l\n( SELECT 1 )')).toBe('select');
    expect(firstKeyword('  ((values (1)))')).toBe('VALUES');
  });
  it('returnsRows for selects and RETURNING', () => {
    expect(returnsRows('SELECT 1')).toBe(true);
    expect(returnsRows('INSERT INTO t VALUES (1) RETURNING *')).toBe(true);
    expect(returnsRows('DELETE FROM t WHERE id = 1 returning id')).toBe(true);
    expect(returnsRows('UPDATE t SET a = 1')).toBe(false);
    expect(returnsRows('CREATE TABLE t (id int)')).toBe(false);
  });
});
