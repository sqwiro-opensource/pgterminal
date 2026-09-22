import { describe, expect, it } from 'vitest';
import { setupTestDb, withTestPool } from './setup';

const { skip } = await setupTestDb();

describe.skipIf(skip)('integration harness smoke', () => {
  it('reads 1,000,000 rows from public.big', async () => {
    await withTestPool(async (pool) => {
      const { rows } = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM public.big');
      expect(rows[0]?.count).toBe('1000000');
    });
  });

  it('seeded sales.sales_customer with a generated _id', async () => {
    await withTestPool(async (pool) => {
      const { rows } = await pool.query<{ _id: string; name: string }>(
        'SELECT _id, name FROM sales.sales_customer WHERE id = 1'
      );
      expect(rows[0]?._id).toBe('sales_customer/1');
      expect(rows[0]?.name).toBe('Customer 1');
    });
  });

  it('has pg_stat_statements and the many schema', async () => {
    await withTestPool(async (pool) => {
      const ext = await pool.query(`SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'`);
      expect(ext.rowCount).toBe(1);
      const many = await pool.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE ns.nspname = 'many' AND c.relkind = 'r'`
      );
      expect(many.rows[0]?.n).toBe('2000');
    });
  });
});
