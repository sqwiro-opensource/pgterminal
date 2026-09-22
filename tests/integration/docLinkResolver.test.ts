import { beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { CatalogService } from '@main/catalog/CatalogService';
import { buildCompletionIndex } from '@main/catalog/CompletionIndex';
import type { PoolProvider } from '@main/catalog/Queryable';
import { resolveDocLink, type ResolverDeps } from '@main/doclink/DocLinkResolver';
import { nodeIds, type RelationKind } from '@shared/catalog/nodeId';
import { parseDocRef } from '@shared/doclink/parseDocRef';
import type { CompletionIndex, RelationNode } from '@shared/types/catalog';
import type { DocLinkResolution } from '@shared/types/doclink';
import { setupTestDb, withTestPool } from './setup';

const { skip } = await setupTestDb();
const CONN = 'test-conn';
const DB = 'pgui_test';

function makeDeps(pool: Pool, index: CompletionIndex): ResolverDeps {
  const provider: PoolProvider = { getPool: () => pool };
  const svc = new CatalogService(provider, () => undefined);
  const kinds = new Map(index.relations.map((r) => [`${r.schema}.${r.name}`, r.kind as RelationKind]));
  return {
    pool,
    index,
    columnsOf: async (schema, table) => {
      const kind = kinds.get(`${schema}.${table}`) ?? 'table';
      const node = (await svc.getNode({ connectionId: CONN, database: DB, nodeId: nodeIds.relation(kind, DB, schema, table) })) as RelationNode;
      return node.columns ?? [];
    }
  };
}

async function resolve(pool: Pool, index: CompletionIndex, raw: string, preferred?: { schema: string; table: string }): Promise<DocLinkResolution> {
  const ref = parseDocRef(raw) ?? { raw, schemaHint: null, table: '', key: '' };
  return resolveDocLink({ connectionId: CONN, database: DB, ref, preferred }, makeDeps(pool, index));
}

describe.skipIf(skip)('DocLinkResolver (integration)', () => {
  let index: CompletionIndex;
  beforeAll(async () => {
    index = await withTestPool((pool) => buildCompletionIndex(pool));
  });

  it('sales_customer/1 resolves via _id (prefixedName) and returns the row', async () => {
    await withTestPool(async (pool) => {
      const r = await resolve(pool, index, 'sales_customer/1');
      expect(r.status).toBe('found');
      if (r.status !== 'found') return;
      expect(r.target).toMatchObject({ schema: 'sales', table: 'sales_customer', keyColumn: '_id', reason: 'prefixedName' });
      expect(r.row.name).toBe('Customer 1');
      expect(r.row._id).toBe('sales_customer/1');
      expect(r.fields.find((f) => f.name === 'balance')?.dataType).toBe('numeric');
      expect(typeof r.row.balance).toBe('string');
    });
  });

  it('sales.sales_customer/1 resolves explicitly (rank 0)', async () => {
    await withTestPool(async (pool) => {
      const r = await resolve(pool, index, 'sales.sales_customer/1');
      expect(r.status).toBe('found');
      if (r.status === 'found') expect(r.target).toMatchObject({ reason: 'explicit', rank: 0, keyColumn: '_id' });
    });
  });

  it('users/<uuid> resolves through the search path on public.users', async () => {
    await withTestPool(async (pool) => {
      const { rows } = await pool.query<{ id: string }>('SELECT id::text AS id FROM public.users ORDER BY email LIMIT 1');
      const uuid = rows[0]!.id;
      const r = await resolve(pool, index, `users/${uuid}`);
      expect(r.status).toBe('found');
      if (r.status === 'found') {
        expect(r.target).toMatchObject({ schema: 'public', table: 'users', reason: 'searchPath' });
        expect(r.row.id).toBe(uuid);
      }
    });
  });

  it('customer/1 falls back to the sales.customer view when no search-path table matches', async () => {
    await withTestPool(async (pool) => {
      const r = await resolve(pool, index, 'customer/1');
      expect(r.status).toBe('found');
      if (r.status === 'found') expect(r.target).toMatchObject({ schema: 'sales', table: 'customer', keyColumn: '_id' });
    });
  });

  it('nosuch/1 is notFound with no candidates; dup/1 is ambiguous', async () => {
    await withTestPool(async (pool) => {
      const none = await resolve(pool, index, 'nosuch/1');
      expect(none).toEqual({ status: 'notFound', candidates: [] });
      const dup = await resolve(pool, index, 'dup/1');
      expect(dup.status).toBe('ambiguous');
      if (dup.status === 'ambiguous') expect(dup.candidates.map((c) => c.schema).sort()).toEqual(['a', 'b']);
      const preferred = await resolve(pool, index, 'dup/1', { schema: 'b', table: 'dup' });
      expect(preferred.status).toBe('found');
      if (preferred.status === 'found') expect(preferred.target).toMatchObject({ schema: 'b', table: 'dup', keyColumn: 'id' });
    });
  });

  it('never breaks on quotes or non-numeric keys; invalid refs are reported', async () => {
    await withTestPool(async (pool) => {
      const quote = await resolve(pool, index, "sales_customer/1';DROP+TABLE+x");
      expect(['notFound', 'invalid']).toContain(quote.status);
      const still = await pool.query(`SELECT count(*)::int AS n FROM sales.sales_customer`);
      expect(still.rows[0]!.n).toBe(50);
      const abc = await resolve(pool, index, 'sales_customer/abc');
      expect(abc.status).toBe('notFound');
      const dupAbc = await resolve(pool, index, 'dup/abc', { schema: 'a', table: 'dup' });
      expect(dupAbc.status).toBe('notFound'); // int pk, non-numeric key → candidate skipped without querying
      const invalid = await resolve(pool, index, 'a b/1');
      expect(invalid.status).toBe('invalid');
    });
  });
});
