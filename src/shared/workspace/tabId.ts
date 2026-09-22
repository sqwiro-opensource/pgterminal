import type { Tab, TabKind, TabParamsByKind } from '../types/workspace';

/**
 * Deterministic tab ids: the same object always maps to the same id, so `openTab({reuse})`
 * focuses an existing tab instead of duplicating it. Ids never contain React elements or
 * transient state; they are safe to persist.
 */
export function tabId<K extends TabKind>(kind: K, params: TabParamsByKind[K]): string {
  switch (kind) {
    case 'query': {
      const p = params as TabParamsByKind['query'];
      return `query:${p.sessionId}`;
    }
    case 'table-data': {
      const p = params as TabParamsByKind['table-data'];
      return `table-data:${p.connectionId}/${p.database}/${p.schema}/${p.table}`;
    }
    case 'table-structure': {
      const p = params as TabParamsByKind['table-structure'];
      return `table-structure:${p.connectionId}/${p.database}/${p.schema}/${p.table}`;
    }
    case 'document': {
      const p = params as TabParamsByKind['document'];
      const target = p.history[p.index];
      const keyValue = target?.keyValue ?? 'new';
      const schema = target?.schema ?? '';
      const table = target?.table ?? '';
      return `document:${p.connectionId}/${p.database}/${schema}/${table}/${encodeURIComponent(keyValue)}`;
    }
    case 'server-overview': {
      const p = params as TabParamsByKind['server-overview'];
      return `server-overview:${p.connectionId}`;
    }
    case 'ddl-preview': {
      const p = params as TabParamsByKind['ddl-preview'];
      return `ddl-preview:${p.connectionId}/${p.database}/${p.ddl.kind}/${p.ddl.schema ?? ''}/${p.ddl.name}`;
    }
    case 'function': {
      const p = params as TabParamsByKind['function'];
      return `function:${p.connectionId}/${p.database}/${p.schema}/${p.name}/${p.args}`;
    }
    case 'connections':
      return 'connections';
    case 'settings':
      return 'settings';
    default: {
      const never: never = kind;
      throw new Error(`unknown tab kind ${String(never)}`);
    }
  }
}

/** Human title used when the caller does not pass one. */
export function defaultTitle<K extends TabKind>(kind: K, params: TabParamsByKind[K]): string {
  switch (kind) {
    case 'query': {
      const p = params as TabParamsByKind['query'];
      return p.name ?? 'Query';
    }
    case 'table-data': {
      const p = params as TabParamsByKind['table-data'];
      return p.table;
    }
    case 'table-structure': {
      const p = params as TabParamsByKind['table-structure'];
      return `${p.table} · structure`;
    }
    case 'document': {
      const p = params as TabParamsByKind['document'];
      const t = p.history[p.index];
      if (!t) return 'Document';
      return t.keyValue.includes('/') ? t.keyValue : `${t.table}/${t.keyValue}`;
    }
    case 'server-overview': {
      const p = params as TabParamsByKind['server-overview'];
      return p.connectionId === 'all' ? 'Fleet' : 'Overview';
    }
    case 'ddl-preview': {
      const p = params as TabParamsByKind['ddl-preview'];
      return `DDL · ${p.ddl.name}`;
    }
    case 'function': {
      const p = params as TabParamsByKind['function'];
      return `${p.name}()`;
    }
    case 'connections':
      return 'Connections';
    case 'settings':
      return 'Settings';
    default: {
      const never: never = kind;
      throw new Error(`unknown tab kind ${String(never)}`);
    }
  }
}

/** The connection a tab belongs to, if any. */
export function tabConnectionId(tab: Pick<Tab, 'kind' | 'params'>): string | null {
  const p = tab.params as { connectionId?: string };
  if (typeof p.connectionId !== 'string') return null;
  if (tab.kind === 'server-overview' && p.connectionId === 'all') return null;
  return p.connectionId;
}
