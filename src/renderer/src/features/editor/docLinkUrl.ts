/**
 * The `pgui-doc:` url a Monaco link carries, and its parser.
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
  tabId?: string;
}

export interface DocLinkUrlPayload extends DocLinkUrlContext {
  raw: string;
}

export const DOC_LINK_SCHEME = 'pgui-doc';

/** Builds the link url, carrying the connection context so the opener needs no editor lookup. */
export function docLinkUrl(raw: string, ctx: DocLinkUrlContext): string {
  const q = new URLSearchParams({ raw, conn: ctx.connectionId, db: ctx.database, ...(ctx.tabId ? { tab: ctx.tabId } : {}) });
  return `${DOC_LINK_SCHEME}:/open?${q.toString()}`;
}

/**
 * Reads a doc-link url back. Accepts the query form this module writes and the older form that
 * put the reference in the authority, in either case tolerating a re-encoded round trip.
 *
 * Values are decoded exactly once (by URLSearchParams), because a key or a tab id may contain a
 * literal `%`. Only the reference gets a second attempt, and only when the first result is not a
 * reference at all — so a valid one is never re-decoded into something else.
 */
export function parseDocLinkUrl(url: string): DocLinkUrlPayload | null {
  if (!url.startsWith(`${DOC_LINK_SCHEME}:`)) return null;
  const q = url.indexOf('?');
  const params = new URLSearchParams(q >= 0 ? url.slice(q + 1) : '');
  const connectionId = params.get('conn');
  const database = params.get('db');
  if (!connectionId || !database) return null;

  const authority = /^pgui-doc:\/\/([^?]*)/.exec(url)?.[1];
  const first = params.get('raw') ?? (authority ? safeDecode(authority) : null);
  if (!first) return null;
  const raw = parseDocRef(first) ? first : (safeDecode(first) ?? first);
  if (!parseDocRef(raw)) return null;

  const tabId = params.get('tab');
  return { raw, connectionId, database, ...(tabId ? { tabId } : {}) };
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
