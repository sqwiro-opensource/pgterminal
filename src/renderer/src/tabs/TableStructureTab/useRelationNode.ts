import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '@renderer/store';
import { nodeKey } from '@renderer/store/catalog.slice';
import { RELATION_KINDS, isRelationKind, nodeIds, type RelationKind } from '@shared/catalog/nodeId';
import type { RelationNode } from '@shared/types/catalog';

export interface RelationRef {
  connectionId: string;
  database: string;
  schema: string;
  table: string;
}

export interface RelationState {
  node: RelationNode | null;
  kind: RelationKind | null;
  loading: boolean;
  error: string | null;
  refresh(): void;
}

/**
 * Loads the relation node for `schema.table`. Relation node ids carry the relation kind, so the kind is
 * resolved first from a cached relation node or from the schema's Tables/Views group nodes.
 */
export function useRelationNode(ref: RelationRef): RelationState {
  const { connectionId, database, schema, table } = ref;
  const [kind, setKind] = useState<RelationKind | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const loadNode = useStore((s) => s.loadNode);

  const candidateKeys = useMemo(
    () => RELATION_KINDS.map((k) => ({ kind: k, key: nodeKey(connectionId, nodeIds.relation(k, database, schema, table)) })),
    [connectionId, database, schema, table]
  );

  const cached = useStore(
    useShallow((s) => {
      for (const c of candidateKeys) {
        const n = s.nodes[c.key];
        if (n && isRelationKind(n.kind)) return { kind: c.kind, node: n as RelationNode, loading: s.loading[c.key] === true, error: s.errors[c.key] };
      }
      const k = kind ? candidateKeys.find((c) => c.kind === kind) : undefined;
      return { kind, node: null, loading: k ? s.loading[k.key] === true : false, error: k ? s.errors[k.key] : undefined };
    })
  );

  useEffect(() => {
    let cancelled = false;
    setResolveError(null);
    if (cached.node) {
      if (kind !== cached.kind) setKind(cached.kind);
      return;
    }
    void (async () => {
      let resolved: RelationKind | null = kind;
      if (!resolved) {
        for (const g of ['tablesGroup', 'viewsGroup'] as const) {
          const group = await loadNode(connectionId, database, nodeIds.group(g, database, schema));
          const hit = group?.children?.find((c) => c.name === table && isRelationKind(c.kind));
          if (hit) {
            resolved = hit.kind as RelationKind;
            break;
          }
        }
      }
      if (cancelled) return;
      if (!resolved) {
        setResolveError(`${schema}.${table} was not found in this database`);
        return;
      }
      setKind(resolved);
      await loadNode(connectionId, database, nodeIds.relation(resolved, database, schema, table), tick > 0);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, database, schema, table, tick, cached.node === null]);

  const refresh = useCallback(() => {
    if (kind) void loadNode(connectionId, database, nodeIds.relation(kind, database, schema, table), true);
    else setTick((t) => t + 1);
  }, [kind, loadNode, connectionId, database, schema, table]);

  return {
    node: cached.node,
    kind: cached.kind ?? kind,
    loading: cached.loading || (!cached.node && !resolveError && !cached.error),
    error: resolveError ?? cached.error ?? null,
    refresh
  };
}
