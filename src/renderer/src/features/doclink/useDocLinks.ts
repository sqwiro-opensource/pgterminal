import { useMemo } from 'react';
import { docLinks, type DocLinks, type LinkContext } from './docLinksService';

/** React entry point to the shared doc-link service; stable identity, safe in deps. */
export function useDocLinks(): DocLinks {
  return docLinks;
}

/** Convenience: a memoised link context for chips inside one tab. */
export function useLinkContext(connectionId: string, database: string, fromTabId?: string): LinkContext {
  return useMemo(
    () => ({ connectionId, database, ...(fromTabId ? { fromTabId } : {}) }),
    [connectionId, database, fromTabId]
  );
}
