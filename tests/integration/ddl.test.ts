import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { getDdl } from '@main/ddl/DdlService';
import { setupTestDb, withTestPool } from './setup';

const { skip } = await setupTestDb();

describe.skipIf(skip)('DdlService (P2.6)', () => {
  beforeAll(async () => {
    await withTestPool(async (pool) => {
      await pool.query('CREATE TABLE IF NOT EXISTS public."Weird Name" ("a""b" int primary key, "Mixed Case" text default \'x\')');
      await pool.query('COMMENT ON TABLE public."Weird Name" IS \'it\'\'s weird\'');
      await pool.query(
        `CREATE OR REPLACE FUNCTION public.ddl_test_fn(x int) RETURNS int LANGUAGE sql AS $$ SELECT x * 2 $$`
      );
    });
  });
  afterAll(async () => {
    await withTestPool(async (pool) => {
      await pool.query('DROP TABLE IF EXISTS public."Weird Name"');
      await pool.query('DROP FUNCTION IF EXISTS public.ddl_test_fn(int)');
    });
  });

  it('renders the seed customer table', async () => {
    await withTestPool(async (pool) => {
      const sql = await getDdl(pool, ddl('table', 'sales', 'sales_customer'));
      expect(sql).toContain('CREATE TABLE sales.sales_customer');
      expect(sql).toContain('GENERATED ALWAYS AS');
      expect(sql).toContain('STORED');
      expect(sql).toContain('PRIMARY KEY');
      expect(sql).toContain('numeric(18,2)');
      expect(sql).not.toMatch(/\$\{/);
    });
  });

  it('renders the FK on sales_order', async () => {
    await withTestPool(async (pool) => {
      const sql = await getDdl(pool, ddl('table', 'sales', 'sales_order'));
      expect(sql).toContain('REFERENCES sales.sales_customer(id)');
    });
  });

  it('renders a view', async () => {
    await withTestPool(async (pool) => {
      const sql = await getDdl(pool, ddl('view', 'sales', 'customer'));
      expect(sql.startsWith('CREATE VIEW sales.customer AS')).toBe(true);
    });
  });

  it('quotes odd identifiers and the script re-executes in a scratch schema', async () => {
    await withTestPool(async (pool) => {
      const sql = await getDdl(pool, ddl('table', 'public', 'Weird Name'));
      expect(sql).toContain('CREATE TABLE public."Weird Name"');
      expect(sql).toContain('"a""b" integer NOT NULL');
      expect(sql).toContain('"Mixed Case" text DEFAULT');
      expect(sql).toContain(`COMMENT ON TABLE public."Weird Name" IS 'it''s weird'`);
      await reexecute(pool, sql, 'public');
      const dup = await getDdl(pool, ddl('table', 'a', 'dup'));
      expect(dup).toContain('CREATE TABLE a.dup');
      await reexecute(pool, dup, 'a');
    });
  });

  it('renders a function with CREATE OR REPLACE FUNCTION', async () => {
    await withTestPool(async (pool) => {
      const sql = await getDdl(pool, ddl('function', 'public', 'ddl_test_fn'));
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.ddl_test_fn(x integer)');
    });
  });

  it('renders index, constraint, column and schema kinds', async () => {
    await withTestPool(async (pool) => {
      const idx = await getDdl(pool, ddl('index', 'sales', 'sales_customer_pkey'));
      expect(idx).toMatch(/^CREATE UNIQUE INDEX sales_customer_pkey ON sales\.sales_customer/);
      const con = await getDdl(pool, { ...ddl('constraint', 'sales', 'sales_order_customer_id_fkey'), parent: 'sales_order' });
      expect(con).toContain('ALTER TABLE sales.sales_order ADD CONSTRAINT sales_order_customer_id_fkey FOREIGN KEY');
      const col = await getDdl(pool, { ...ddl('column', 'sales', '_id'), parent: 'sales_customer' });
      expect(col).toContain('ALTER TABLE sales.sales_customer ADD COLUMN _id text');
      expect(col).toContain('GENERATED ALWAYS AS');
      const sch = await getDdl(pool, ddl('schema', undefined, 'sales'));
      expect(sch).toContain('CREATE SCHEMA sales AUTHORIZATION');
      expect(sch).toMatch(/-- \d+ tables, \d+ views, \d+ functions/);
    });
  });

  it('throws a plain error for unknown objects', async () => {
    await withTestPool(async (pool) => {
      await expect(getDdl(pool, ddl('table', 'sales', 'nope'))).rejects.toThrow('Relation sales.nope not found');
    });
  });
});

function ddl(kind: Parameters<typeof getDdl>[1]['kind'], schema: string | undefined, name: string) {
  return { connectionId: 'c', database: 'pgui_test', kind, schema, name };
}

/** Runs `sql` with the schema swapped for a temporary one, proving the script is executable. */
async function reexecute(pool: Pool, sql: string, schema: string): Promise<void> {
  const scratch = `ddl_scratch_${Date.now()}`;
  const swapped = sql.split(`${schema}.`).join(`${scratch}.`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA ${scratch}`);
    await client.query(swapped);
    await client.query(`DROP SCHEMA ${scratch} CASCADE`);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
