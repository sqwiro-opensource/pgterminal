import type { DdlRequest } from './catalog';
import type { DocTarget } from './doclink';
import type { Filter, PageSpec, Sort } from './rows';

/** Kinds of tab the workspace can hold. Components are looked up by kind. */
export type TabKind =
  | 'query'
  | 'table-data'
  | 'table-structure'
  | 'document'
  | 'server-overview'
  | 'ddl-preview'
  | 'function'
  | 'connections'
  | 'settings';

/** Serialisable params per tab kind. */
export interface TabParamsByKind {
  query: { connectionId: string; database: string; sessionId: string; sql: string; name?: string };
  'table-data': {
    connectionId: string;
    database: string;
    schema: string;
    table: string;
    filters: Filter[];
    sort: Sort[];
    page: PageSpec;
  };
  'table-structure': {
    connectionId: string;
    database: string;
    schema: string;
    table: string;
    section: 'columns' | 'indexes' | 'constraints' | 'triggers' | 'relations' | 'partitions' | 'ddl';
  };
  document: { connectionId: string; database: string; history: DocTarget[]; index: number; view: 'tree' | 'json' };
  'server-overview': { connectionId: string | 'all' };
  'ddl-preview': { connectionId: string; database: string; ddl: DdlRequest };
  function: { connectionId: string; database: string; schema: string; name: string; args: string };
  connections: Record<string, never>;
  settings: Record<string, never>;
}

/** A tab is plain data; no React elements. */
export interface Tab<K extends TabKind = TabKind> {
  id: string;
  kind: K;
  title: string;
  params: TabParamsByKind[K];
  dirty: boolean;
  pinned: boolean;
  createdAt: number;
}

/** Persisted workspace, written by main to workspace.json. */
export interface WorkspaceSnapshot {
  version: 1;
  tabs: Tab[];
  activeTabId: string | null;
  sidebar: { width: number; expandedNodeIds: string[]; activeConnectionId: string | null };
}
