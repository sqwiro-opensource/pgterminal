/**
 * The `pgterminal-doc:` url a Monaco link carries, and its parser.
 *
 * Kept free of any monaco import so it can be tested in node: the link provider needs a
 * browser, these strings do not.
 *
 * The payload lives in the query string, never in the authority. A reference contains a slash
 * (`schema_table/key`), and an encoded slash in the authority is exactly what URI normalisation
 * mangles — Monaco hands the opener a re-serialised Uri, which double-encoded the reference and
 * left the link looking fine but doing nothing when clicked.
 */
import { parseDocRef } from '@shared/doclink/parseDocRef';

export interface DocLinkUrlContext {
  connectionId: string;
  database: string;
}

export interface DocLinkUrlPayload extends DocLinkUrlContext {
  raw: string;
}

export const DOC_LINK_SCHEME = 'pgterminal-doc';

/** Builds the link url, carrying the connection context so the opener needs no editor lookup. */
export function docLinkUrl(raw: string, ctx: DocLinkUrlContext): string {
  const q = new URLSearchParams({ raw, conn: ctx.connectionId, db: ctx.database });
  return `${DOC_LINK_SCHEME}:/open?${q.toString()}`;
}

/**
 * Reads a doc-link url back.
 *
 * Monaco hands the opener a re-serialised Uri, and that serialisation percent-encodes the query
 * separators themselves: `?raw=a&conn=b` comes back as `?raw%3Da%26conn%3Db`. So the query is
 * decoded first when its separators are encoded, before it is parsed.
 *
 * Values are then decoded exactly once, by URLSearchParams, because a key may contain a literal
 * percent escape. Only the reference gets a second attempt, and only when the first result is
 * not a reference at all, so a valid one is never re-decoded into something else.
 */
export function parseDocLinkUrl(url: string): DocLinkUrlPayload | null {
  if (!url.startsWith(`${DOC_LINK_SCHEME}:`)) return null;
  const q = url.indexOf('?');
  if (q < 0) return null;

  let query = url.slice(q + 1);
  if (!query.includes('=') && /%3D/i.test(query)) query = safeDecode(query) ?? query;

  const params = new URLSearchParams(query);
  const connectionId = params.get('conn');
  const database = params.get('db');
  if (!connectionId || !database) return null;

  const first = params.get('raw');
  if (!first) return null;
  const raw = parseDocRef(first) ? first : (safeDecode(first) ?? first);
  if (!parseDocRef(raw)) return null;

  return { raw, connectionId, database };
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
