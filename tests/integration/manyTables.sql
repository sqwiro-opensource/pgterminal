-- 2,000 small tables for the catalog NFR (tree usable < 2 s, node expand < 300 ms).
CREATE SCHEMA many;
DO $$
BEGIN
  FOR i IN 1..2000 LOOP
    EXECUTE format('CREATE TABLE many.t_%s (id int PRIMARY KEY, v text)', lpad(i::text, 4, '0'));
  END LOOP;
END $$;
