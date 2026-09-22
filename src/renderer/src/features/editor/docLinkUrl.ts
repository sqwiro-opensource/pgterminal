/**
 * The `pgui-doc://` url a Monaco link carries. Kept free of any monaco import so it can be
 * tested in node: the link provider needs a browser, this string does not.
 */
export interface DocLinkUrlContext {
  connectionId: string;
  database: string;
  tabId?: string;
}

/** Builds the link url, carrying the connection context so the opener needs no editor lookup. */
export function docLinkUrl(raw: string, ctx: DocLinkUrlContext): string {
  const q = new URLSearchParams({ conn: ctx.connectionId, db: ctx.database, ...(ctx.tabId ? { tab: ctx.tabId } : {}) });
  return `pgui-doc://${encodeURIComponent(raw)}?${q.toString()}`;
}
