import { describe, expect, it } from 'vitest';
import type { ColumnInfo } from '../../../src/shared/types/catalog';
import { NO_ALTERS, addColumn, alterCount, buildAddConstraint, buildAlterStatements, buildCreateIndex, buildCreateTable, dropColumn, editColumn } from '../../../src/renderer/src/tabs/TableStructureTab/pendingAlters';

const col = (name: string, over: Partial<ColumnInfo> = {}): ColumnInfo => ({
  name, ordinal: 1, dataType: 'text', nullable: true, default: null, generated: null, identity: null, isPk: false, isFk: false, isUnique: false, comment: null, ...over
});
const columns = [col('id', { dataType: 'int4', nullable: false, isPk: true }), col('name'), col('Weird Name')];

describe('pendingAlters', () => {
  it('drops an edit that returns to the original value', () => {
    let p = editColumn(NO_ALTERS, columns[1]!, { nullable: false });
    expect(alterCount(p)).toBe(1);
    p = editColumn(p, columns[1]!, { nullable: true });
    expect(alterCount(p)).toBe(0);
  });
  it('emits ALTER statements in a safe order with quoted identifiers', () => {
    let p = editColumn(NO_ALTERS, columns[2]!, { dataType: 'varchar(20)', nullable: false, default: "'x'", comment: "it's", name: 'weird' });
    p = addColumn(p, { name: 'phone', dataType: 'text', nullable: true, default: '', comment: '' });
    p = dropColumn(p, 'name');
    const sql = buildAlterStatements('sales', 'Customer', columns, p);
    expect(sql).toEqual([
      'ALTER TABLE sales."Customer" DROP COLUMN name;',
      'ALTER TABLE sales."Customer" ADD COLUMN phone text;',
      'ALTER TABLE sales."Customer" ALTER COLUMN "Weird Name" TYPE varchar(20);',
      'ALTER TABLE sales."Customer" ALTER COLUMN "Weird Name" SET NOT NULL;',
      "ALTER TABLE sales.\"Customer\" ALTER COLUMN \"Weird Name\" SET DEFAULT 'x';",
      "COMMENT ON COLUMN sales.\"Customer\".\"Weird Name\" IS 'it''s';",
      'ALTER TABLE sales."Customer" RENAME COLUMN "Weird Name" TO weird;'
    ]);
  });
  it('dropping a column discards its pending edits', () => {
    let p = editColumn(NO_ALTERS, columns[1]!, { dataType: 'int4' });
    p = dropColumn(p, 'name');
    expect(buildAlterStatements('s', 't', columns, p)).toEqual(['ALTER TABLE s.t DROP COLUMN name;']);
  });
  it('builds CREATE TABLE with a composite PK as a table constraint and identity columns', () => {
    const sql = buildCreateTable('public', 'order item', [
      { name: 'order_id', dataType: 'int8', nullable: false, default: '', primaryKey: true },
      { name: 'line', dataType: 'int4', nullable: false, default: '1', primaryKey: true },
      { name: 'id', dataType: 'bigint', nullable: false, default: '', identity: 'always', comment: 'surrogate' }
    ]);
    expect(sql).toBe(
      'CREATE TABLE public."order item" (\n  order_id int8 NOT NULL,\n  line int4 NOT NULL DEFAULT 1,\n  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,\n  PRIMARY KEY (order_id, line)\n);\n' +
        "COMMENT ON COLUMN public.\"order item\".id IS 'surrogate';"
    );
  });
  it('single PK stays inline; defaults are kept (legacy dropped them)', () => {
    expect(buildCreateTable('s', 't', [{ name: 'id', dataType: 'serial', nullable: false, default: '', primaryKey: true }, { name: 'at', dataType: 'timestamptz', nullable: false, default: 'now()' }])).toBe(
      'CREATE TABLE s.t (\n  id serial NOT NULL PRIMARY KEY,\n  at timestamptz NOT NULL DEFAULT now()\n);'
    );
  });
  it('index and constraint builders', () => {
    expect(buildCreateIndex('s', 't', { name: '', columns: ['a', 'B'], unique: true, method: 'btree', where: 'a > 0' })).toBe('CREATE UNIQUE INDEX "t_a_B_idx" ON s.t USING btree (a, "B") WHERE a > 0;');
    expect(buildAddConstraint('s', 't', 'chk', 'CHECK (a > 0)')).toBe('ALTER TABLE s.t ADD CONSTRAINT chk CHECK (a > 0);');
  });
});
