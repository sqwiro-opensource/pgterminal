-- pgterminal v2 integration seed. Mirrors .claude/specs/plan.html "Seed schema".
-- Mutable tables (sales.sales_customer, sales.sales_order) are re-created by tests/integration/setup.ts reseedMutable().
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

CREATE SCHEMA sales;
CREATE SCHEMA auth;
CREATE SCHEMA a;
CREATE SCHEMA b;

CREATE TABLE auth.auth_user (
  id        serial PRIMARY KEY,
  _id       text GENERATED ALWAYS AS ('auth_user/' || id::text) STORED,
  email     text NOT NULL,
  name      text,
  role      text NOT NULL DEFAULT 'user',
  is_active boolean NOT NULL DEFAULT true
);
INSERT INTO auth.auth_user (email, name, role, is_active) VALUES
  ('admin@sqwiro.test', 'Admin', 'admin', true),
  ('ops@sqwiro.test', 'Ops', 'ops', true),
  ('b.gaitho@cloudhub.co.ke', 'Bernard Gaitho', 'admin', true),
  ('viewer@sqwiro.test', 'Viewer', 'viewer', false),
  ('sales@sqwiro.test', 'Sales Desk', 'user', true);

CREATE TABLE sales.sales_customer (
  id         serial PRIMARY KEY,
  _id        text GENERATED ALWAYS AS ('sales_customer/' || id::text) STORED,
  name       text NOT NULL,
  email      text,
  country    text,
  active     boolean NOT NULL DEFAULT true,
  balance    numeric(18,2),
  meta       jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sales.sales_order (
  id           serial PRIMARY KEY,
  _id          text GENERATED ALWAYS AS ('sales_order/' || id::text) STORED,
  customer_id  int REFERENCES sales.sales_customer(id),   -- FK backlink
  customer_ref text,                                       -- 'sales_customer/N' text backlink
  payload      jsonb,                                      -- {"customer": "sales_customer/N", "refs": ["sales_customer/N"], "meta": {"owner": "auth_user/M"}}
  total        numeric(18,2),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sales_order_customer_id_idx ON sales.sales_order (customer_id);

-- strippedName candidate: 'customer/1' -> sales.customer
CREATE VIEW sales.customer AS SELECT * FROM sales.sales_customer;

CREATE TABLE public.users (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  _id   text GENERATED ALWAYS AS ('users/' || id::text) STORED,
  email text,
  name  text,
  tags  text[]
);
INSERT INTO public.users (email, name, tags) VALUES
  ('u1@example.com', 'User One', ARRAY['crm_tag/4']),
  ('u2@example.com', 'User Two', ARRAY['crm_tag/12','crm_tag/4']),
  ('u3@example.com', 'User Three', NULL),
  ('u4@example.com', NULL, ARRAY[]::text[]),
  ('u5@example.com', 'User Five', ARRAY['sales_customer/1']);

-- ambiguity fixture: 'dup/1' resolves to both a.dup and b.dup
CREATE TABLE a.dup (id int PRIMARY KEY);
CREATE TABLE b.dup (id int PRIMARY KEY);
INSERT INTO a.dup VALUES (1);
INSERT INTO b.dup VALUES (1);

CREATE TABLE public.big (
  id   bigserial PRIMARY KEY,
  n    numeric(30,10),
  b    bigint,
  j    jsonb,
  t    text,
  flag boolean,
  ts   timestamptz
);
INSERT INTO public.big (n, b, j, t, flag, ts)
SELECT (g / 3.0)::numeric(30,10),
       9007199254740993 + g,
       jsonb_build_object('i', g, 'ref', 'sales_customer/' || (g % 50 + 1)),
       'row ' || g,
       g % 2 = 0,
       now() - (g || ' seconds')::interval
FROM generate_series(1, 1000000) g;

-- Mutable data. Keep in sync with reseedMutable() in tests/integration/setup.ts.
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
FROM generate_series(1, 50) g;

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
FROM generate_series(1, 200) g;

ANALYZE;
