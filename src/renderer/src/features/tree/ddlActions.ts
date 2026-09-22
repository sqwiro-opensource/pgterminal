/**
 * Real execution for confirmed DDL (CF class): runs the SQL through the query runner, then closes tabs
 * that reference a dropped object and refreshes the affected catalog nodes. Throws on failure so the
 * confirm dialog can show the error in place.
 */
import { toast } from 'sonner';
import { nodeIds } from '@shared/catalog/nodeId';
import { describeError, execSql } from '@renderer/lib/execSql';
import { useStore } from '@renderer/store';

export interface DdlTarget {
  database: string;
  schema?: string;
  /** Relation/function/sequence/type name when the statement targets one object. */
  name?: string;
  /** True when the object no longer exists afterwards (DROP): its tabs get closed. */
  dropped?: boolean;
}

/** Tabs whose params point at `schema.name` on this connection/database. */
export function tabsReferencing(connectionId: string, t: DdlTarget): string[] {
  const { tabs } = useStore.getState();
  return tabs
    .filter((tab) => {
      const p = tab.params as Record<string, unknown>;
      if (p.connectionId !== connectionId || p.database !== t.database) return false;
      if (t.name === undefined) return t.schema !== undefined && p.schema === t.schema;
      const table = (p.table ?? p.name) as string | undefined;
      if (tab.kind === 'ddl-preview') {
        const ddl = p.ddl as { schema?: string; name?: string } | undefined;
        return ddl?.schema === t.schema && ddl?.name === t.name;
      }
      if (tab.kind === 'document') {
        const hist = p.history as Array<{ schema: string; table: string }> | undefined;
        return Boolean(hist?.some((h) => h.schema === t.schema && h.table === t.name));
      }
      return p.schema === t.schema && table === t.name;
    })
    .map((t) => t.id);
}

/** Refreshes the schema node (and the relation node when known) so the tree and structure tabs update. */
export async function refreshAfterDdl(connectionId: string, t: DdlTarget): Promise<void> {
  const s = useStore.getState();
  s.invalidate(connectionId, t.database);
  const keys: string[] = [nodeIds.database(t.database)];
  if (t.schema) keys.push(nodeIds.schema(t.database, t.schema));
  for (const id of keys) {
    const loaded = Object.keys(s.nodes).some((k) => k === `${connectionId}:${id}`) || s.expanded[`${connectionId}:${id}`];
    if (loaded) await s.loadNode(connectionId, t.database, id, true);
  }
}

/** Execute confirmed DDL; resolves on success, throws a readable Error on failure. */
export async function executeDdl(p: { connectionId: string; database: string; sql: string; verb?: string; target?: DdlTarget }): Promise<void> {
  const res = await execSql({ connectionId: p.connectionId, database: p.database, sql: p.sql });
  if (!res.ok) throw new Error(describeError(res.error));
  const target = p.target ?? { database: p.database };
  if (target.dropped) {
    const ids = tabsReferencing(p.connectionId, target);
    for (const id of ids) useStore.getState().closeTab(id, { force: true });
    if (ids.length) toast.info(`Closed ${ids.length} tab${ids.length === 1 ? '' : 's'} for the dropped object`);
  }
  await refreshAfterDdl(p.connectionId, target);
  toast.success(`${p.verb ?? 'Done'} · ${res.commands.join(', ') || 'OK'} · ${res.durationMs} ms`);
}
