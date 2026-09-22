/** Shared execution helpers for structure sub-tab actions: confirm → execute → refresh the relation node. */
import { toast } from 'sonner';
import type { RelationNode } from '@shared/types/catalog';
import { nodeIds } from '@shared/catalog/nodeId';
import { useStore } from '@renderer/store';
import { confirm, type ConfirmVariant } from '@renderer/components/ui/ConfirmDialog';
import { executeDdl } from '@renderer/features/tree/ddlActions';

export interface StructureCtx {
  connectionId: string;
  database: string;
  node: RelationNode;
}

/** Opens the confirm dialog for `statements` and, on confirm, executes them and reloads the relation. */
export function confirmAndRun(ctx: StructureCtx, p: { title: string; verb: string; variant: ConfirmVariant; summary: string; statements: string[]; typedName?: string }): void {
  const s = useStore.getState();
  const meta = s.connections[ctx.connectionId];
  const needsTyped = meta?.env === 'prod' && s.settings.typedConfirmOnProd && p.typedName;
  const sql = p.statements.join('\n');
  confirm({
    title: p.title,
    verb: p.verb,
    variant: p.variant,
    env: meta?.env,
    connectionName: meta?.name,
    summary: p.summary,
    typedName: needsTyped ? p.typedName : undefined,
    buildSql: () => sql,
    onOpenInEditor: (text) => s.openTab('query', { connectionId: ctx.connectionId, database: ctx.database, sessionId: crypto.randomUUID(), sql: text }, { reuse: false }),
    onConfirm: async (text) => {
      await executeDdl({ connectionId: ctx.connectionId, database: ctx.database, sql: text, verb: p.verb, target: { database: ctx.database, schema: ctx.node.schema, name: ctx.node.name } });
      await useStore.getState().loadNode(ctx.connectionId, ctx.database, nodeIds.relation(ctx.node.kind, ctx.database, ctx.node.schema, ctx.node.name), true);
    }
  });
}

export function isReadOnly(connectionId: string): boolean {
  const s = useStore.getState();
  if (s.connections[connectionId]?.readOnly) {
    toast.info('Read-only connection');
    return true;
  }
  return false;
}
