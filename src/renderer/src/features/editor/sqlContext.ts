/**
 * Pure, DOM-free analysis of the SQL text around the cursor: which clause we are in, the tables/aliases in
 * scope of the current statement, and the identifier prefix being typed. Feeds completion and hover.
 */
import { statementAt, type Statement } from '@shared/sql/statementSplitter';

export type SqlContextKind = 'afterFrom' | 'afterDot' | 'column' | 'keyword' | 'none';

export interface TableRef {
  schema?: string;
  table: string;
  alias?: string;
}

export interface SqlContext {
  kind: SqlContextKind;
  /** Identifier fragment before the cursor (unquoted). */
  prefix: string;
  /** For `afterDot`: the identifier before the dot (unquoted). */
  qualifier?: string;
  /** alias (or bare table name) → referenced table. */
  aliases: Record<string, { schema?: string; table: string }>;
  tablesInScope: TableRef[];
  /** Statement under the cursor, when any. */
  statement: Statement | null;
}

export interface Token {
  type: 'ident' | 'punct' | 'string' | 'number' | 'param';
  /** Unquoted identifier text, or the raw text for other token types. */
  value: string;
  /** True when the identifier was double-quoted (never a keyword). */
  quoted: boolean;
  start: number;
  end: number;
}

const TABLE_INTRO = new Set(['FROM', 'JOIN', 'UPDATE', 'INTO', 'TABLE']);
/** Keywords that end a table reference list / can never be an alias. */
const STOP_WORDS = new Set([
  'WHERE', 'ON', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'CROSS', 'FULL', 'NATURAL', 'LATERAL', 'SET', 'VALUES',
  'USING', 'GROUP', 'ORDER', 'LIMIT', 'OFFSET', 'HAVING', 'WINDOW', 'UNION', 'EXCEPT', 'INTERSECT', 'RETURNING',
  'AS', 'AND', 'OR', 'NOT', 'SELECT', 'FROM', 'INTO', 'UPDATE', 'DELETE', 'INSERT', 'WITH', 'FOR', 'FETCH',
  'TABLESAMPLE', 'ONLY', 'DEFAULT', 'DO', 'CONFLICT', 'IS', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'ILIKE', 'CASE',
  'WHEN', 'THEN', 'ELSE', 'END', 'DISTINCT', 'ALL', 'ANY', 'SOME', 'NULL', 'TRUE', 'FALSE', 'ASC', 'DESC', 'NULLS',
  'FIRST', 'LAST', 'OVER', 'PARTITION', 'BY', 'FILTER', 'ROWS', 'RANGE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE',
  'EXPLAIN', 'ANALYZE', 'VERBOSE'
]);
const COLUMN_CLAUSES = new Set([
  'SELECT', 'WHERE', 'ON', 'BY', 'HAVING', 'SET', 'AND', 'OR', 'RETURNING', 'WHEN', 'THEN', 'ELSE', 'CASE',
  'DISTINCT', 'FILTER', 'OVER', 'PARTITION', 'ORDER', 'GROUP', 'USING', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'ILIKE', 'IS'
]);
const CLAUSE_KEYWORDS = new Set([
  ...TABLE_INTRO, ...COLUMN_CLAUSES, 'VALUES', 'DELETE', 'INSERT', 'LIMIT', 'OFFSET', 'WITH', 'AS', 'CREATE',
  'ALTER', 'DROP', 'UNION', 'EXCEPT', 'INTERSECT', 'END'
]);

const isIdentStart = (c: string): boolean => /[A-Za-z_\u0080-\uFFFF]/.test(c);
const isIdentChar = (c: string): boolean => /[A-Za-z0-9_$\u0080-\uFFFF]/.test(c);
const TWO_CHAR_OPS = new Set(['::', '->', '=>', '<=', '>=', '<>', '!=', '||', '@>', '<@']);

function skipBalanced(tokens: Token[], j: number): number {
  let depth = 0;
  while (j < tokens.length) {
    const u = tokens[j] as Token;
    if (u.type === 'punct' && u.value === '(') depth++;
    if (u.type === 'punct' && u.value === ')') {
      depth--;
      if (depth === 0) return j + 1;
    }
    j++;
  }
  return j;
}

/** Tokenise SQL, dropping comments; strings/numbers/params are kept as opaque tokens. */
export function tokenize(sql: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i] as string;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '-' && sql[i + 1] === '-') {
      const e = sql.indexOf('\n', i);
      i = e < 0 ? n : e + 1;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--;
          i += 2;
        } else i++;
      }
      continue;
    }
    if (c === "'" || ((c === 'E' || c === 'e') && sql[i + 1] === "'")) {
      const start = i;
      const escapes = c !== "'";
      i += escapes ? 2 : 1;
      while (i < n) {
        if (escapes && sql[i] === '\\') {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      out.push({ type: 'string', value: sql.slice(start, i), quoted: false, start, end: i });
      continue;
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_]*)\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const close = sql.indexOf(tag, i + tag.length);
        const end = close < 0 ? n : close + tag.length;
        out.push({ type: 'string', value: sql.slice(i, end), quoted: false, start: i, end });
        i = end;
        continue;
      }
      const p = /^\$\d+/.exec(sql.slice(i));
      if (p) {
        out.push({ type: 'param', value: p[0], quoted: false, start: i, end: i + p[0].length });
        i += p[0].length;
        continue;
      }
    }
    if (c === '"') {
      const start = i;
      i++;
      let v = '';
      while (i < n) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') {
            v += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        v += sql[i];
        i++;
      }
      out.push({ type: 'ident', value: v, quoted: true, start, end: i });
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(sql[i + 1] ?? ''))) {
      const m = /^[0-9]*\.?[0-9]+(e[+-]?\d+)?/i.exec(sql.slice(i)) ?? /^[0-9]+/.exec(sql.slice(i));
      const len = m ? m[0].length : 1;
      out.push({ type: 'number', value: sql.slice(i, i + len), quoted: false, start: i, end: i + len });
      i += len;
      continue;
    }
    if (isIdentStart(c)) {
      const start = i;
      while (i < n && isIdentChar(sql[i] as string)) i++;
      out.push({ type: 'ident', value: sql.slice(start, i), quoted: false, start, end: i });
      continue;
    }
    const two = sql.slice(i, i + 2);
    if (TWO_CHAR_OPS.has(two)) {
      out.push({ type: 'punct', value: two, quoted: false, start: i, end: i + 2 });
      i += 2;
      continue;
    }
    out.push({ type: 'punct', value: c, quoted: false, start: i, end: i + 1 });
    i++;
  }
  return out;
}

const kw = (t: Token | undefined): string | null =>
  t && t.type === 'ident' && !t.quoted ? t.value.toUpperCase() : null;

const isNameToken = (t: Token | undefined): t is Token =>
  !!t && t.type === 'ident' && (t.quoted || !STOP_WORDS.has(t.value.toUpperCase()));

/** Collect `FROM`/`JOIN`/`UPDATE`/`INTO`/`TABLE` table references with optional schema and alias. */
export function collectTableRefs(tokens: Token[]): TableRef[] {
  const refs: TableRef[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const k = kw(tokens[i]);
    if (!k || !TABLE_INTRO.has(k)) continue;
    let j = i + 1;
    // `CREATE TABLE IF NOT EXISTS x` / `DROP TABLE IF EXISTS x` / `FROM ONLY x`
    while (['IF', 'NOT', 'EXISTS', 'ONLY'].includes(kw(tokens[j]) ?? '')) j++;
    for (;;) {
      const t = tokens[j];
      if (!t) break;
      if (t.type === 'punct' && t.value === '(') {
        // subquery: skip it and an optional alias
        j = skipBalanced(tokens, j);
        if (kw(tokens[j]) === 'AS') j++;
        if (isNameToken(tokens[j])) j++;
      } else if (isNameToken(t)) {
        let schema: string | undefined;
        let table = t.value;
        j++;
        const dot = tokens[j];
        if (dot && dot.type === 'punct' && dot.value === '.') {
          const nameTok = tokens[j + 1];
          if (nameTok && nameTok.type === 'ident') {
            schema = table;
            table = nameTok.value;
            j += 2;
          } else break; // `schema.` still being typed
        }
        const after = tokens[j];
        if (after && after.type === 'punct' && after.value === '(' && (k === 'FROM' || k === 'JOIN')) {
          // function call in FROM (generate_series(...)) — not a table
          j = skipBalanced(tokens, j);
          if (kw(tokens[j]) === 'AS') j++;
          if (isNameToken(tokens[j])) j++;
        } else {
          let alias: string | undefined;
          if (kw(tokens[j]) === 'AS') j++;
          const a = tokens[j];
          if (isNameToken(a)) {
            alias = a.value;
            j++;
          }
          const ref: TableRef = { table };
          if (schema) ref.schema = schema;
          if (alias) ref.alias = alias;
          refs.push(ref);
        }
      } else break;
      const sep = tokens[j];
      if (sep && sep.type === 'punct' && sep.value === ',' && k !== 'UPDATE' && k !== 'TABLE') {
        j++;
        continue;
      }
      break;
    }
  }
  return refs;
}

const EMPTY_ALIASES: SqlContext['aliases'] = {};

export function analyzeSqlContext(text: string, offset: number): SqlContext {
  const stmt = statementAt(text, offset);
  if (!stmt) return { kind: 'keyword', prefix: '', aliases: EMPTY_ALIASES, tablesInScope: [], statement: null };
  const local = stmt.text;
  const tokens = tokenize(local);
  const refs = collectTableRefs(tokens);
  const aliases: SqlContext['aliases'] = {};
  for (const r of refs) {
    const target: { schema?: string; table: string } = { table: r.table };
    if (r.schema) target.schema = r.schema;
    aliases[r.table] = target;
    if (r.alias) aliases[r.alias] = target;
  }

  // Prefix being typed and the tokens strictly before it (measured on the original text, so trailing
  // whitespace after a keyword is not mistaken for a word being typed).
  const before = text.slice(stmt.start, offset);
  const localOffset = before.length;
  const quoteCount = (before.match(/"/g) ?? []).length;
  let rawPrefix = '';
  if (quoteCount % 2 === 1) {
    rawPrefix = before.slice(before.lastIndexOf('"'));
  } else {
    const pm = /("(?:[^"]|"")*"|[A-Za-z_\u0080-\uFFFF][A-Za-z0-9_$\u0080-\uFFFF]*)$/.exec(before);
    rawPrefix = pm ? pm[0] : '';
  }
  const prefix = rawPrefix.startsWith('"')
    ? rawPrefix.slice(1).replace(/"$/, '').replace(/""/g, '"')
    : rawPrefix;
  const cut = localOffset - rawPrefix.length;
  const prior = tokens.filter((t) => t.end <= cut);
  const last = prior[prior.length - 1];
  const base = { prefix, aliases, tablesInScope: refs, statement: stmt } as const;

  if (last && last.type === 'punct' && last.value === '.') {
    const q = prior[prior.length - 2];
    if (q && q.type === 'ident') return { kind: 'afterDot', qualifier: q.value, ...base };
  }

  // Last clause keyword before the cursor, tracking an open paren after INTO for `INSERT INTO t (col, |`.
  let lastClause: string | null = null;
  let intoParenOpen = false;
  let parenDepth = 0;
  for (const t of prior) {
    if (t.type === 'punct' && t.value === '(') parenDepth++;
    if (t.type === 'punct' && t.value === ')') parenDepth = Math.max(0, parenDepth - 1);
    const k = kw(t);
    if (k && CLAUSE_KEYWORDS.has(k)) {
      lastClause = k;
      intoParenOpen = false;
    }
    if (lastClause === 'INTO' && t.type === 'punct' && t.value === '(') intoParenOpen = true;
  }
  const lastIsComma = !!last && last.type === 'punct' && last.value === ',';
  const lastKw = kw(last);

  if (lastKw && TABLE_INTRO.has(lastKw)) return { kind: 'afterFrom', ...base };
  if (lastIsComma && (lastClause === 'FROM' || lastClause === 'JOIN')) return { kind: 'afterFrom', ...base };
  if (lastClause === 'INTO' && intoParenOpen && parenDepth > 0) return { kind: 'column', ...base };
  if (lastClause && COLUMN_CLAUSES.has(lastClause) && refs.length > 0) return { kind: 'column', ...base };
  if (lastClause === 'VALUES' || lastClause === 'LIMIT' || lastClause === 'OFFSET') return { kind: 'none', ...base };
  return { kind: 'keyword', ...base };
}
