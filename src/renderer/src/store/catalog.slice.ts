import type { CatalogNode, CompletionIndex } from '@shared/types/catalog';
import { decodeNodeId, nodeIdMatches } from '@shared/catalog/nodeId';
import { pgterminal, useIpcEvent } from '@renderer/lib/ipc';
import type { SliceCreator } from './index';
import { useStore } from './index';

/** `${connectionId}:${nodeId}` — connection ids are uuids, node ids never contain ':' (segments are URL-encoded). */
export type NodeKey = `${string}:${string}`;

export const nodeKey = (connectionId: string, nodeId: string): NodeKey => `${connectionId}:${nodeId}`;

export function splitNodeKey(key: NodeKey): { connectionId: string; nodeId: string } {
  const i = key.indexOf(':');
  return { connectionId: key.slice(0, i), nodeId: key.slice(i + 1) };
}

/** Node kinds whose rows are derived from an already-loaded relation node; they never hit IPC. */
const DERIVED_KINDS = new Set(['columnsGroup', 'indexesGroup', 'constraintsGroup', 'triggersGroup']);

/** True when expanding this key should fetch a catalog node. Synthetic keys (server, group, more…) are not loadable. */
export function isLoadableNodeId(nodeId: string): { database: string } | null {
  try {
    const { kind, path } = decodeNodeId(nodeId);
    const database = path[0];
    if (!database || DERIVED_KINDS.has(kind) || kind === 'connection') return null;
    return { database };
  } catch {
    return null;
  }
}

export interface CatalogSlice {
  nodes: Record<NodeKey, CatalogNode>;
  loading: Record<NodeKey, boolean>;
  errors: Record<NodeKey, string | undefined>;
  expanded: Record<NodeKey, boolean>;
  completionIndex: Record<string, CompletionIndex>;
  loadNode(connectionId: string, database: string, nodeId: string, refresh?: boolean): Promise<CatalogNode | undefined>;
  toggleExpanded(key: NodeKey, force?: boolean): void;
  invalidate(connectionId: string, database?: string, nodeIdPrefix?: string): void;
  ensureCompletionIndex(connectionId: string, database: string, refresh?: boolean): Promise<CompletionIndex | undefined>;
}

export const createCatalogSlice: SliceCreator<CatalogSlice> = (set, get) => ({
  nodes: {},
  loading: {},
  errors: {},
  expanded: {},
  completionIndex: {},

  async loadNode(connectionId, database, nodeId, refresh = false) {
    const key = nodeKey(connectionId, nodeId);
    const state = get();
    if (!refresh && state.nodes[key]) return state.nodes[key];
    if (state.loading[key]) return undefined;
    set((s) => ({ loading: { ...s.loading, [key]: true }, errors: { ...s.errors, [key]: undefined } }));
    try {
      const node = await pgterminal['catalog:getNode']({ connectionId, database, nodeId, refresh });
      set((s) => ({ nodes: { ...s.nodes, [key]: node }, loading: { ...s.loading, [key]: false } }));
      return node;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set((s) => ({ loading: { ...s.loading, [key]: false }, errors: { ...s.errors, [key]: message } }));
      return undefined;
    }
  },

  toggleExpanded(key, force) {
    const next = force ?? !get().expanded[key];
    set((s) => ({ expanded: { ...s.expanded, [key]: next } }));
    if (!next) return;
    const { connectionId, nodeId } = splitNodeKey(key);
    const loadable = isLoadableNodeId(nodeId);
    if (loadable && !get().nodes[key] && !get().loading[key]) {
      void get().loadNode(connectionId, loadable.database, nodeId);
    }
  },

  invalidate(connectionId, database, nodeIdPrefix) {
    const hits = (key: string): boolean => {
      const { connectionId: c, nodeId } = splitNodeKey(key as NodeKey);
      if (c !== connectionId) return false;
      if (database !== undefined) {
        let db: string | undefined;
        try {
          db = decodeNodeId(nodeId).path[0];
        } catch {
          return false;
        }
        if (db !== database) return false;
      }
      return nodeIdPrefix === undefined || nodeIdMatches(nodeIdPrefix, nodeId);
    };
    set((s) => {
      const nodes = { ...s.nodes };
      const errors = { ...s.errors };
      for (const k of Object.keys(nodes)) if (hits(k)) delete nodes[k as NodeKey];
      for (const k of Object.keys(errors)) if (hits(k)) delete errors[k as NodeKey];
      const completionIndex = { ...s.completionIndex };
      for (const k of Object.keys(completionIndex)) {
        if (k.startsWith(`${connectionId}/`) && (database === undefined || k === `${connectionId}/${database}`)) {
          delete completionIndex[k];
        }
      }
      return { nodes, errors, completionIndex };
    });
    // Re-fetch nodes that are still expanded so the tree does not go blank after a DDL change.
    const { expanded, loadNode } = get();
    for (const key of Object.keys(expanded)) {
      if (!expanded[key as NodeKey] || !hits(key)) continue;
      const { nodeId } = splitNodeKey(key as NodeKey);
      const loadable = isLoadableNodeId(nodeId);
      if (loadable) void loadNode(connectionId, loadable.database, nodeId, true);
    }
  },

  async ensureCompletionIndex(connectionId, database, refresh = false) {
    const k = `${connectionId}/${database}`;
    const cached = get().completionIndex[k];
    if (cached && !refresh) return cached;
    try {
      const index = await pgterminal['catalog:completionIndex']({ connectionId, database, refresh });
      set((s) => ({ completionIndex: { ...s.completionIndex, [k]: index } }));
      return index;
    } catch (err) {
      console.warn(`completion index for ${k} failed: ${(err as Error).message}`);
      return undefined;
    }
  }
});

/** Mount once (CatalogTree does) to keep the cache coherent with DDL executed elsewhere. */
export function useCatalogEvents(): void {
  useIpcEvent('catalog:invalidated', (e) => {
    useStore.getState().invalidate(e.connectionId, e.database, e.nodeId);
  });
}
