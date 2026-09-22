import { Pool, type PoolClient } from 'pg';

/** Connection string for the disposable test database (docker-compose.test.yml). */
export const PG_TEST_URL =
  process.env.PG_TEST_URL ?? 'postgres://pgui:pgui@127.0.0.1:54329/pgui_test';

let availability: Promise<boolean> | null = null;

/** True when the test database answers within 2 s. Cached per process. */
export function hasTestDb(): Promise<boolean> {
  if (availability) return availability;
  availability = (async () => {
    const pool = new Pool({ connectionString: PG_TEST_URL, connectionTimeoutMillis: 2000, max: 1 });
    try {
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    } finally {
      await pool.end().catch(() => undefined);
    }
  })();
  return availability;
}

/** Resolves to `{ skip }`; use `describe.skipIf(skip)` / `it.skipIf(skip)` in test files. */
export async function setupTestDb(): Promise<{ skip: boolean; url: string }> {
  const ok = await hasTestDb();
  if (!ok) {
    // eslint-disable-next-line no-console
    console.warn(`[integration] test database not reachable at ${PG_TEST_URL}; skipping`);
  }
  return { skip: !ok, url: PG_TEST_URL };
}

/** Creates a Pool for the test database, runs `fn`, always ends the pool. */
export async function withTestPool<T>(fn: (pool: Pool) => Promise<T>, max = 4): Promise<T> {
  const pool = new Pool({ connectionString: PG_TEST_URL, max, application_name: 'pgui-test' });
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

type Queryable = Pool | PoolClient;

/** Re-inserts the mutable rows exactly as seed.sql does. Assumes the tables are empty and sequences reset. */
export async function reseedMutable(db: Queryable): Promise<void> {
  await db.query(`
    INSERT INTO sales.sales_customer (name, email, country, active, balance, meta, created_at)
    SELECT
      CASE WHEN g = 7 THEN 'O''Brien & Sons' ELSE 'Customer ' || g END,
      CASE WHEN g % 10 = 0 THEN NULL ELSE 'c' || g || '@example.com' END,
      (ARRAY['KE','UG','TZ','RW', NULL])[(g % 5) + 1],
      g % 4 <> 0,
      CASE WHEN g % 6 = 0 THEN NULL ELSE (g * 1234.56)::numeric(18,2) END,
      CASE WHEN g % 9 = 0 THEN NULL ELSE jsonb_build_object(
        'tier', CASE WHEN g % 5 = 0 THEN 'gold' ELSE 'std' END,
        'owner', 'auth_user/' || ((g % 5) + 1),
        'tags', jsonb_build_array('crm_tag/' || ((g % 3) + 4)),
        'contact', jsonb_build_object('phone', '+254 700 000 ' || lpad(g::text, 3, '0'), 'account', 'billing_account/' || g)
      ) END,
      now() - (g || ' days')::interval
    FROM generate_series(1, 50) g`);
  await db.query(`
    INSERT INTO sales.sales_order (customer_id, customer_ref, payload, total, created_at)
    SELECT
      (g % 50) + 1,
      'sales_customer/' || ((g % 50) + 1),
      jsonb_build_object(
        'customer', 'sales_customer/' || ((g % 50) + 1),
        'refs', jsonb_build_array('sales_customer/' || ((g % 50) + 1), 'auth_user/' || ((g % 5) + 1)),
        'meta', jsonb_build_object('owner', 'auth_user/' || ((g % 5) + 1))
      ),
      (g * 12.34)::numeric(18,2),
      now() - (g || ' hours')::interval
    FROM generate_series(1, 200) g`);
}

/** Truncates the mutable tables (orders, customers), resets identities, and reseeds them. */
export async function truncateMutable(db?: Queryable): Promise<void> {
  const run = async (q: Queryable) => {
    await q.query('TRUNCATE sales.sales_order, sales.sales_customer RESTART IDENTITY CASCADE');
    await reseedMutable(q);
  };
  if (db) return run(db);
  await withTestPool((pool) => run(pool), 1);
}
