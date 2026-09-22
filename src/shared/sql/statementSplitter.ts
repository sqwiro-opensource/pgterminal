/**
 * Pure SQL statement splitter for PostgreSQL scripts.
 *
 * Finds statement boundaries only (no parsing). Understands:
 *   'single quotes' with '' escapes, E'…' with backslash escapes, "identifiers",
 *   $$…$$ and $tag$…$tag$ dollar quoting, -- line comments and nested block comments.
 * Semicolons inside any of those never split. Offsets refer to the original string so
 * the editor can map statements back to ranges.
 */

/** One statement of a script, with its trimmed text and original offsets. */
export interface Statement {
  /** Statement text without surrounding whitespace or leading/trailing comments. */
  text: string;
  /** Offset of the first character of `text` in the original script. */
  start: number;
  /** Offset one past the last character of `text` in the original script. */
  end: number;
}

/** Coarse statement kind, decided by the first keyword. */
export type StatementKind = 'select' | 'dml' | 'ddl' | 'tcl' | 'other';

const isIdentChar = (c: string): boolean => /[A-Za-z0-9_]/.test(c);

/**
 * Scans a block comment starting at `i` (which points at '/'), honouring nesting.
 * Returns the index just past the closing '*\/' (or sql.length if unterminated).
 */
function skipBlockComment(sql: string, i: number): number {
  let depth = 0;
  const n = sql.length;
  while (i < n) {
    if (sql[i] === '/' && sql[i + 1] === '*') {
      depth++;
      i += 2;
    } else if (sql[i] === '*' && sql[i + 1] === '/') {
      depth--;
      i += 2;
      if (depth === 0) return i;
    } else {
      i++;
    }
  }
  return n;
}

/** Returns the index just past the end of a `--` comment (the newline is not consumed). */
function skipLineComment(sql: string, i: number): number {
  const nl = sql.indexOf('\n', i);
  return nl === -1 ? sql.length : nl;
}

/** Tries to read a dollar-quote tag at `i` ('$'). Returns the full tag (e.g. `$$`, `$fn$`) or null. */
function readDollarTag(sql: string, i: number): string | null {
  if (sql[i] !== '$') return null;
  let j = i + 1;
  // tag: optional identifier (must not start with a digit)
  if (j < sql.length && /[A-Za-z_]/.test(sql[j] as string)) {
    while (j < sql.length && isIdentChar(sql[j] as string)) j++;
  }
  if (sql[j] === '$') return sql.slice(i, j + 1);
  return null;
}

/**
 * Advances past the token starting at `i` if it is a string, identifier, comment or dollar quote.
 * Returns the new index, or -1 when `i` does not start such a token.
 */
function skipOpaque(sql: string, i: number): number {
  const c = sql[i] as string;
  const next = sql[i + 1];
  const n = sql.length;

  if (c === '-' && next === '-') return skipLineComment(sql, i + 2);
  if (c === '/' && next === '*') return skipBlockComment(sql, i);

  if (c === "'" || c === '"') {
    const q = c;
    let j = i + 1;
    while (j < n) {
      if (sql[j] === q) {
        if (sql[j + 1] === q) {
          j += 2; // doubled quote escape
          continue;
        }
        return j + 1;
      }
      j++;
    }
    return n;
  }

  // E'…' strings with backslash escapes (only when the E is not part of an identifier)
  if ((c === 'E' || c === 'e') && next === "'" && (i === 0 || !isIdentChar(sql[i - 1] as string))) {
    let j = i + 2;
    while (j < n) {
      const ch = sql[j];
      if (ch === '\\') {
        j += 2;
        continue;
      }
      if (ch === "'") {
        if (sql[j + 1] === "'") {
          j += 2;
          continue;
        }
        return j + 1;
      }
      j++;
    }
    return n;
  }

  if (c === '$' && (i === 0 || !isIdentChar(sql[i - 1] as string))) {
    const tag = readDollarTag(sql, i);
    if (tag) {
      const close = sql.indexOf(tag, i + tag.length);
      return close === -1 ? n : close + tag.length;
    }
  }

  return -1;
}

/**
 * Trims whitespace and leading/trailing comments from the range [start, end).
 * Returns the trimmed range, or null when nothing but whitespace/comments remains.
 */
function trimRange(sql: string, start: number, end: number): [number, number] | null {
  let s = start;
  // leading whitespace / comments
  for (;;) {
    while (s < end && /\s/.test(sql[s] as string)) s++;
    if (s >= end) return null;
    if (sql[s] === '-' && sql[s + 1] === '-') {
      s = Math.min(end, skipLineComment(sql, s + 2));
      continue;
    }
    if (sql[s] === '/' && sql[s + 1] === '*') {
      s = Math.min(end, skipBlockComment(sql, s));
      continue;
    }
    break;
  }
  // trailing whitespace / comments: rescan from s and remember the last non-opaque, non-space char
  let e = s;
  let i = s;
  while (i < end) {
    const c = sql[i] as string;
    const isComment = (c === '-' && sql[i + 1] === '-') || (c === '/' && sql[i + 1] === '*');
    const j = skipOpaque(sql, i);
    if (j !== -1) {
      if (!isComment) e = Math.min(j, end);
      i = j;
      continue;
    }
    if (!/\s/.test(c)) e = i + 1;
    i++;
  }
  return e > s ? [s, e] : null;
}

/** Splits a script into statements. Empty statements are skipped; a trailing statement without `;` is included. */
export function splitStatements(sql: string): Statement[] {
  const out: Statement[] = [];
  const n = sql.length;
  let segStart = 0;
  let i = 0;

  const push = (from: number, to: number): void => {
    const r = trimRange(sql, from, to);
    if (r) out.push({ text: sql.slice(r[0], r[1]), start: r[0], end: r[1] });
  };

  while (i < n) {
    const j = skipOpaque(sql, i);
    if (j !== -1) {
      i = j;
      continue;
    }
    if (sql[i] === ';') {
      push(segStart, i);
      i++;
      segStart = i;
      continue;
    }
    i++;
  }
  push(segStart, n);
  return out;
}

/**
 * The statement containing `offset`, or the nearest statement before it when the offset is in
 * the whitespace/comment gap after a statement. Null when there is no statement at or before it.
 */
export function statementAt(sql: string, offset: number): Statement | null {
  const stmts = splitStatements(sql);
  if (stmts.length === 0) return null;
  const off = Math.max(0, Math.min(offset, sql.length));
  let best: Statement | null = null;
  for (const s of stmts) {
    if (off >= s.start && off <= s.end) return s;
    if (s.start <= off) best = s;
    else break;
  }
  return best ?? stmts[0] ?? null;
}

const SELECT_KW = new Set(['SELECT', 'WITH', 'VALUES', 'TABLE', 'SHOW', 'EXPLAIN', 'FETCH']);
const DML_KW = new Set(['INSERT', 'UPDATE', 'DELETE', 'MERGE']);
const DDL_KW = new Set([
  'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'COMMENT', 'GRANT', 'REVOKE', 'REINDEX', 'VACUUM', 'ANALYZE', 'CLUSTER'
]);
const TCL_KW = new Set(['BEGIN', 'START', 'COMMIT', 'END', 'ROLLBACK', 'SAVEPOINT', 'RELEASE']);

/** First keyword of a statement, skipping leading comments, whitespace and opening parentheses. */
export function firstKeyword(text: string): string | null {
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i] as string;
    if (/\s/.test(c) || c === '(') {
      i++;
      continue;
    }
    if (c === '-' && text[i + 1] === '-') {
      i = skipLineComment(text, i + 2);
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      i = skipBlockComment(text, i);
      continue;
    }
    break;
  }
  const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i));
  return m ? m[0].toUpperCase() : null;
}

/** Classifies a statement by its first keyword. */
export function classifyStatement(text: string): StatementKind {
  const kw = firstKeyword(text);
  if (!kw) return 'other';
  if (SELECT_KW.has(kw)) return 'select';
  if (DML_KW.has(kw)) return 'dml';
  if (DDL_KW.has(kw)) return 'ddl';
  if (TCL_KW.has(kw)) return 'tcl';
  return 'other';
}

/** True when the statement is expected to produce a result set (SELECT-like, or DML with RETURNING). */
export function returnsRows(text: string): boolean {
  return classifyStatement(text) === 'select' || /\bRETURNING\b/i.test(text);
}
