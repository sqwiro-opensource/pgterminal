import { beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { CatalogService } from '@main/catalog/CatalogService';
import type { PoolProvider, Queryable } from '@main/catalog/Queryable';
import { nodeIds } from '@shared/catalog/nodeId';
import type { CatalogInvalidatedEvent, DatabaseNode, RelationNode, SchemaNode } from '@shared/types/catalog';
import { setupTestDb, withTestPool } from './setup';

const { skip } = await setupTestDb();

/** Wraps a pool so tests can count round trips. */
function counting(pool: Pool): { q: Queryable; count: () => number } {
  let n = 0;
  const q: Queryable = {
    query: (text, values) => {
      n += 1;
      return pool.query(text, values as never[]);
    }
  };
  return { q, count: () => n };
}

function provider(q: Queryable): PoolProvider {
  return { getPool: () => q };
}

const CONN = 'test-conn';
const DB = 'pgui_test';

describe.skipIf(skip)('CatalogService', () => {
  let hasMany = false;
  beforeAll(async () => {
    await withTestPool(async (pool) => {
      const r = await pool.query(`SELECT 1 FROM pg_namespace WHERE nspname = 'many'`);
      hasMany = r.rowCount === 1;
    });
  });

  it('lists user schemas on the database node and hides system schemas', async () => {
    await withTestPool(async (pool) => {
      const svc = new CatalogService(provider(pool));
      const node = (await svc.getNode({ connectionId: CONN, database: DB, nodeId: nodeIds.database(DB) })) as DatabaseNode;
      const names = node.schemas.map((s) => s.name);
      expect(names).toEqual(expect.arrayContaining(['public', 'sales', 'auth', 'a', 'b']));
      if (hasMany) expect(names).toContain('many');
      expect(names).not.toContain('pg_catalog');
      expect(names).not.toContain('information_schema');
      expect(names[0]).toBe('public');
      expect(node.server.versionNum).toBeGreaterThan(160000);
      expect(node.server.extensions).toContain('pg_stat_statements');
      expect(node.searchPath).toContain('public');
      expect(node.children?.some((c) => c.kind === 'extension' && c.name === 'pg_stat_statements')).toBe(true);
    });
  });

  it('shows system schemas when showInternal is set', async () => {
    await withTestPool(async (pool) => {
      const svc = new CatalogService(provider(pool));
      const node = (await svc.getNode({ connectionId: CONN, database: DB, nodeId: nodeIds.database(DB), showInternal: true })) as DatabaseNode;
      expect(node.schemas.map((s) => s.name)).toContain('pg_catalog');
    });
  });

  it('schema sales has 2 tables, 1 view and folder counts', async () => {
    await withTestPool(async (pool) => {
      const svc = new CatalogService(provider(pool));
      const schema = (await svc.getNode({ connectionId: CONN, database: DB, nodeId: nodeIds.schema(DB, 'sales') })) as SchemaNode;
      const byKind = Object.fromEntries((schema.children ?? []).map((c) => [c.kind, c.count]));
      expect(byKind['tablesGroup']).toBe(2);
      expect(byKind['viewsGroup']).toBe(1);
      expect(byKind['sequencesGroup']).toBe(2); // serial ids of the two tables
      const tables = await svc.getNode({ connectionId: CONN, database: DB, nodeId: nodeIds.group('tablesGroup', DB, 'sales') });
      expect(tables.children?.map((c) => c.name).sort()).toEqual(['sales_customer', 'sales_order']);
      const t = tables.children?.find((c) => c.name === 'sales_customer') as RelationNode;
      expect(t.kind).toBe('table');
      expect(Number(t.estimatedRows)).toBeGreaterThanOrEqual(0);
      const views = await svc.getNode({ connectionId: CONN, database: DB, nodeId: nodeIds.group('viewsGroup', DB, 'sales') });
      expect(views.children?.map((c) => c.name)).toEqual(['customer']);
      expect(views.children?.[0]?.kind).toBe('view');
    });
  });

  it('relation sales.sales_customer exposes the generated _id, the pk and its sub-folders', async () => {
    await withTestPool(async (pool) => {
      const svc = new CatalogService(provider(pool));
      const rel = (await svc.getNode({ connectionId: CONN, database: DB, nodeId: nodeIds.relation('table', DB, 'sales', 'sales_customer') })) as RelationNode;
      const idCol = rel.columns?.find((c) => c.name === '_id');
      expect(idCol?.generated).toBe('stored');
      expect(idCol?.dataType).toBe('text');
      const id = rel.columns?.find((c) => c.name === 'id');
      expect(id?.isPk).toBe(true);
      expect(id?.default).toMatch(/nextval/);
      expect(rel.indexes?.some((i) => i.isPrimary && i.columns.includes('id'))).toBe(true);
      expect(rel.constraints?.find((k) => k.type === 'p')?.columns).toEqual(['id']);
      expect(rel.children?.map((c) => c.kind)).toEqual(['columnsGroup', 'indexesGroup', 'constraintsGroup', 'triggersGroup']);
      const colsGroup = await svc.getNode({ connectionId: CONN, database: DB, nodeId: nodeIds.relGroup('columnsGroup', DB, 'sales', 'table', 'sales_customer') });
      expect(colsGroup.count).toBe(rel.columns?.length);
      const leaf = await svc.getNode({ connectionId: CONN, database: DB, nodeId: nodeIds.relChild('column', DB, 'sales', 'table', 'sales_customer', '_id') });
      expect(leaf.kind).toBe('column');
      expect((leaf as { detail?: { generated?: string } }).detail?.generated).toBe('stored');
    });
  });

  it('sales.sales_order carries the FK to sales_customer and its index', async () => {
    await withTestPool(async (pool) => {
      const svc = new CatalogService(provider(pool));
      const rel = (await svc.getNode({ connectionId: CONN, database: DB, nodeId: nodeIds.relation('table', DB, 'sales', 'sales_order') })) as RelationNode;
      const fk = rel.constraints?.find((k) => k.type === 'f');
      expect(fk?.columns).toEqual(['customer_id']);
      expect(fk?.refSchema).toBe('sales');
      expect(fk?.refTable).toBe('sales_customer');
      expect(fk?.refColumns).toEqual(['id']);
      expect(fk?.onDelete).toBe('NO ACTION');
      expect(rel.columns?.find((c) => c.name === 'customer_id')?.isFk).toBe(true);
      expect(rel.indexes?.some((i) => i.name === 'sales_order_customer_id_idx' && i.method === 'btree')).toBe(true);
    });
  });

  it('public.users has a generated _id over a uuid pk; sales.customer view has a definition', async () => {
    await withTestPool(async (pool) => {
      const svc = new CatalogService(provider(pool));
      const users = (await svc.getNode({ connectionId: CONN, database: DB, nodeId: nodeIds.relation('table', DB, 'public', 'users') })) as RelationNode;
      expect(users.columns?.find((c) => c.name === '_id')?.generated).toBe('stored');
      expect(users.columns?.find((c) => c.name === 'id')?.dataType).toBe('uuid');
      const view = (await svc.getNode({ connectionId: CONN, database: DB, nodeId: nodeIds.relation('view', DB, 'sales', 'customer') })) as RelationNode;
      expect(view.viewDefinition).toMatch(/sales_customer/);
      expect(view.children?.map((c) => c.kind)).toEqual(['columnsGroup', 'triggersGroup']);
    });
  });

  it('caches: second getNode issues no query, refresh issues queries, invalidate clears and emits', async () => {
    await withTestPool(async (pool) => {
      const { q, count } = counting(pool);
      const events: CatalogInvalidatedEvent[] = [];
      const svc = new CatalogService(provider(q), (e) => events.push(e));
      const id = nodeIds.relation('table', DB, 'sales', 'sales_customer');
      await svc.getNode({ connectionId: CONN, database: DB, nodeId: id });
      const after1 = count();
      expect(after1).toBeGreaterThan(0);
      await svc.getNode({ connectionId: CONN, database: DB, nodeId: id });
      expect(count()).toBe(after1);
      await svc.getNode({ connectionId: CONN, database: DB, nodeId: id, refresh: true });
      expect(count()).toBeGreaterThan(after1);
      const after2 = count();
      svc.invalidate(CONN, DB, id);
      expect(events).toEqual([{ connectionId: CONN, database: DB, nodeId: id }]);
      await svc.getNode({ connectionId: CONN, database: DB, nodeId: id });
      expect(count()).toBeGreaterThan(after2);
      svc.invalidate(CONN);
      expect(events.at(-1)).toEqual({ connectionId: CONN, database: DB });
    });
  });

  it('concurrent requests for the same node share one load', async () => {
    await withTestPool(async (pool) => {
      const { q, count } = counting(pool);
      const svc = new CatalogService(provider(q));
      const id = nodeIds.schema(DB, 'sales');
      await Promise.all([1, 2, 3].map(() => svc.getNode({ connectionId: CONN, database: DB, nodeId: id })));
      const n = count();
      await svc.getNode({ connectionId: CONN, database: DB, nodeId: id, refresh: true });
      // three concurrent calls cost the same as one refresh
      expect(count() - n).toBe(n);
    });
  });

  it('completion index has sales.sales_customer with pk info and builds fast', async () => {
    await withTestPool(async (pool) => {
      const svc = new CatalogService(provider(pool));
      const t0 = performance.now();
      const index = await svc.getCompletionIndex({ connectionId: CONN, database: DB });
      const ms = performance.now() - t0;
      // eslint-disable-next-line no-console
      console.log(`[catalog] completion index: ${index.relations.length} relations in ${ms.toFixed(0)} ms (many schema: ${hasMany})`);
      expect(ms).toBeLessThan(2000);
      const cust = index.relations.find((r) => r.schema === 'sales' && r.name === 'sales_customer');
      expect(cust?.kind).toBe('table');
      expect(cust?.columns.find((c) => c.name === 'id')?.isPk).toBe(true);
      expect(cust?.columns.find((c) => c.name === '_id')?.type).toBe('text');
      expect(index.relations.find((r) => r.schema === 'sales' && r.name === 'customer')?.kind).toBe('view');
      if (hasMany) expect(index.relations.filter((r) => r.schema === 'many')).toHaveLength(2000);
      expect(index.searchPath).toContain('public');
      const again = await svc.getCompletionIndex({ connectionId: CONN, database: DB });
      expect(again).toBe(index);
    });
  });
});
