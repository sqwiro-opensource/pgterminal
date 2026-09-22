/**
 * Subsequence fuzzy matching for the command palette.
 *
 * Scoring favours, in order: matches that start at a word boundary (`sales_customer` for `sc`),
 * runs of consecutive characters, and matches near the start of a short target. Word-boundary
 * matches outrank consecutive ones so acronym-style queries find the object the user meant:
 * `sc` ranks `sales_customer` above `schema_cache`.
 */

const BOUNDARY_CHARS = new Set(['_', '.', '-', ' ', '/', ':']);

/** True when `i` starts a word: position 0, after a separator, or a camelCase hump. */
function isWordStart(target: string, i: number): boolean {
  if (i === 0) return true;
  const prev = target[i - 1];
  const cur = target[i];
  if (prev === undefined || cur === undefined) return false;
  if (BOUNDARY_CHARS.has(prev)) return true;
  return prev === prev.toLowerCase() && cur !== cur.toLowerCase() && prev !== prev.toUpperCase();
}

const SCORE_BASE = 1;
const SCORE_BOUNDARY = 12;
const SCORE_CONSECUTIVE = 6;
const SCORE_ALL_BOUNDARIES = 25;
const SCORE_EXACT_PREFIX = 20;
const PENALTY_GAP = 1;

/**
 * Scores `query` against `target`; higher is better, `null` when the query is not a subsequence.
 * An empty query scores 0 (everything matches).
 */
export function fuzzyScore(query: string, target: string): number | null {
  if (query.length === 0) return 0;
  if (query.length > target.length) return null;

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  let score = 0;
  let ti = 0;
  let lastMatch = -2;
  let allAtBoundary = true;

  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    if (ch === undefined) return null;
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;

    score += SCORE_BASE;
    if (isWordStart(target, found)) score += SCORE_BOUNDARY;
    else allAtBoundary = false;
    if (found === lastMatch + 1) score += SCORE_CONSECUTIVE;
    else score -= Math.min(found - lastMatch - 1, 8) * PENALTY_GAP;

    lastMatch = found;
    ti = found + 1;
  }

  if (allAtBoundary) score += SCORE_ALL_BOUNDARIES;
  if (t.startsWith(q)) score += SCORE_EXACT_PREFIX;
  // Shorter targets win ties: a 12-char name beats a 40-char one for the same match quality.
  score -= target.length / 50;
  return score;
}

export interface FuzzyMatch<T> {
  item: T;
  score: number;
}

/**
 * Ranks `items` by the best score of `query` against `keyFn(item)`. Items that do not match are
 * dropped. With an empty query the original order is preserved (truncated to `limit`).
 */
export function fuzzyFilter<T>(items: readonly T[], query: string, keyFn: (item: T) => string, limit = 50): Array<FuzzyMatch<T>> {
  if (query.length === 0) return items.slice(0, limit).map((item) => ({ item, score: 0 }));
  const out: Array<FuzzyMatch<T>> = [];
  for (const item of items) {
    const score = fuzzyScore(query, keyFn(item));
    if (score !== null) out.push({ item, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

/**
 * Ranks against several keys (e.g. table name, then `schema.table`), keeping the best score.
 * Earlier keys are preferred on ties so the primary name wins over the qualified form.
 */
export function fuzzyFilterMulti<T>(items: readonly T[], query: string, keysFn: (item: T) => string[], limit = 50): Array<FuzzyMatch<T>> {
  if (query.length === 0) return items.slice(0, limit).map((item) => ({ item, score: 0 }));
  const out: Array<FuzzyMatch<T>> = [];
  for (const item of items) {
    let best: number | null = null;
    const keys = keysFn(item);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key === undefined) continue;
      const score = fuzzyScore(query, key);
      if (score === null) continue;
      const adjusted = score - i * 0.5;
      if (best === null || adjusted > best) best = adjusted;
    }
    if (best !== null) out.push({ item, score: best });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
