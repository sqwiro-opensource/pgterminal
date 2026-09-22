import type { DocRef } from '../types/doclink';

/** PostgreSQL-style identifier: letter/underscore then up to 62 more word chars. */
const IDENT = '[A-Za-z_][A-Za-z0-9_]{0,62}';
/** ArangoDB `_key` charset (ints, uuids and text keys all pass). */
const KEY = "[A-Za-z0-9_\\-:.@()+,=;$!*'%]{1,254}";

const GRAMMAR = new RegExp(`^(?:(${IDENT})\\.)?(${IDENT})\\/(${KEY})$`);

/** Longest string we bother parsing (schema 63 + '.' + table 63 + '/' + key 254 = 382 > 320 cap by design). */
export const MAX_REF_LENGTH = 320;

/**
 * Parses a `[schema.]table/key` document reference.
 * Returns null for anything that is not a string, contains whitespace, has more than one `/`,
 * or fails the grammar. `users/42` is valid: no underscore is required.
 */
export function parseDocRef(value: unknown): DocRef | null {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > MAX_REF_LENGTH) return null;
  if (/\s/.test(value)) return null;
  const first = value.indexOf('/');
  if (first === -1 || value.indexOf('/', first + 1) !== -1) return null;
  const m = GRAMMAR.exec(value);
  if (!m) return null;
  const schema = m[1];
  const table = m[2];
  const key = m[3];
  if (table === undefined || key === undefined) return null;
  return { raw: value, schemaHint: schema ?? null, table, key };
}

/** Rebuilds the raw string from its parts (inverse of parseDocRef for valid input). */
export function formatDocRef(ref: Pick<DocRef, 'schemaHint' | 'table' | 'key'>): string {
  return `${ref.schemaHint ? `${ref.schemaHint}.` : ''}${ref.table}/${ref.key}`;
}
