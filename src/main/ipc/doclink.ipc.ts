import type { Pool, PoolClient } from 'pg';
import type { ColumnInfo, RelationNode } from '@shared/types/catalog';
import { nodeIds, type RelationKind } from '@shared/catalog/nodeId';
import { handle, push } from './handle';
import { getCatalogService } from './catalog.ipc';
import { registry } from '@main/db/ConnectionRegistry';
import { getFkIndex } from '@main/catalog/fkIndex';
import { resolveDocLink } from '@main/doclink/DocLinkResolver';
import { findBacklinks, type CancelSignal } from '@main/doclink/BacklinkFinder';
import { getSettings } from '@main/store/stores';

const jobs = new Map<string, { signal: CancelSignal; client: PoolClient | null; pid: number | null; pool: Pool }>();

const RELATION_KINDS: RelationKind[] = ['table', 'partitionedTable', 'view', 'matview', 'foreignTable'];

function showInternal(): boolean {
  try {
    return getSettings().showInternalSchemas === true;
  } catch {
    return false;
  }
}

/** Columns of `schema.table` via the catalog service (kind looked up in the completion index). */
async function columnsOfFactory(connectionId: string, database: string, kinds: Map<string, string>) {
  const svc = await getCatalogService();
  return async (schema: string, table: string): Promise<ColumnInfo[]> => {
    const kind = (kinds.get(`${schema}.${table}`) ?? 'table') as RelationKind;
    const order = [kind, ...RELATION_KINDS.filter((k) => k !== kind)];
    for (const k of order) {
      try {
        const node = (await svc.getNode({ connectionId, database, nodeId: nodeIds.relation(k, database, schema, table), showInternal: showInternal() })) as RelationNode;
        if (node?.columns) return node.columns;
      } catch {
        // try the next kind
      }
    }
    return [];
  };
}

export function registerDoclinkIpc(): void {
  handle('doclink:resolve', async (req) => {
    if (!registry.has(req.connectionId)) throw new Error('Not connected');
    const pool = registry.getPool(req.connectionId, req.database);
    const svc = await getCatalogService();
    const index = await svc.getCompletionIndex({ connectionId: req.connectionId, database: req.database, showInternal: showInternal() });
    const kinds = new Map(index.relations.map((r) => [`${r.schema}.${r.name}`, r.kind]));
    const columnsOf = await columnsOfFactory(req.connectionId, req.database, kinds);
    return resolveDocLink(req, { pool, index, columnsOf });
  });

  handle('doclink:backlinks', async (req) => {
    if (!registry.has(req.connectionId)) throw new Error('Not connected');
    const pool = registry.getPool(req.connectionId, req.database);
    const svc = await getCatalogService();
    const index = await svc.getCompletionIndex({ connectionId: req.connectionId, database: req.database, showInternal: showInternal() });
    const fkIndex = await getFkIndex(pool);
    const signal: CancelSignal = { cancelled: false };
    const client = await pool.connect();
    const pid = (client as PoolClient & { processID?: number }).processID ?? null;
    jobs.set(req.jobId, { signal, client, pid, pool });
    void findBacklinks(req, { pool: client, index, fkIndex }, (e) => push('doclink:backlinksEvent', e), signal)
      .catch((err: unknown) => {
        push('doclink:backlinksEvent', { jobId: req.jobId, type: signal.cancelled ? 'cancelled' : 'done' });
        process.stderr.write(`[doclink] backlinks job ${req.jobId} failed: ${String(err)}\n`);
      })
      .finally(() => {
        jobs.delete(req.jobId);
        client.release();
      });
    return { accepted: true } as const;
  });

  handle('doclink:cancelBacklinks', async (req) => {
    const job = jobs.get(req.jobId);
    if (!job) return;
    job.signal.cancelled = true;
    if (job.pid) {
      await job.pool.query('SELECT pg_cancel_backend($1)', [job.pid]).catch(() => undefined);
    }
  });
}
