import { describe, expect, it } from 'vitest';
import type { FieldInfo } from '../../../src/shared/types/query';
import {
  buildUpdateOp,
  cellsEqual,
  coerceInput,
  deletePreviewSql,
  diffRow,
  draftToJsonText,
  orderFieldsForPreview,
  parseDraft,
  rowToObject,
  setPath,
  toMutationSet,
  updatePreviewSql
} from '../../../src/renderer/src/tabs/DocumentTab/documentModel';

const f = (name: string, dataType: string): FieldInfo => ({ name, dataType, dataTypeID: 0, tableID: 0, columnID: 0 });
const fields = [f('id', 'int4'), f('_id', 'text'), f('name', 'text'), f('meta', 'jsonb'), f('balance', 'numeric'), f('active', 'bool')];

describe('documentModel', () => {
  it('rowToObject keys by column name and fills missing cells with null', () => {
    expect(rowToObject(fields, ['1', 'sales_customer/1', 'Acme'])).toEqual({ id: '1', _id: 'sales_customer/1', name: 'Acme', meta: null, balance: null, active: null });
  });

  it('cellsEqual compares NULL, strings, numbers and JSON structurally', () => {
    expect(cellsEqual(null, null)).toBe(true);
    expect(cellsEqual(null, '')).toBe(false);
    expect(cellsEqual('1.10', '1.10')).toBe(true);
    expect(cellsEqual({ a: [1] }, { a: [1] })).toBe(true);
    expect(cellsEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('diffRow lists only changed columns; jsonb goes out as raw JSON text, NULL stays NULL', () => {
    const original = { id: '1', _id: 'x/1', name: 'Acme', meta: { tier: 'gold' }, balance: '1.10', active: true };
    const draft = { ...original, name: null, meta: { tier: 'silver', owner: 'auth_user/3' }, balance: '1.10' };
    const diff = diffRow(original, draft, fields);
    expect(diff.map((d) => d.column)).toEqual(['name', 'meta']);
    const set = toMutationSet(diff, fields);
    expect(set.name).toBeNull();
    expect(set.meta).toBe(JSON.stringify({ tier: 'silver', owner: 'auth_user/3' }));
    const op = buildUpdateOp(original, draft, fields, { id: '1' });
    expect(op).toEqual({ op: 'update', pk: { id: '1' }, set });
    expect(buildUpdateOp(original, { ...original }, fields, { id: '1' })).toBeNull();
  });

  it('never emits a WHERE-less statement and numbers parameters without gaps', () => {
    const sql = updatePreviewSql('sales', 'Weird "T"', { name: 'x', meta: '{}' }, { id: '1', 'a b': 2 });
    expect(sql).toContain('UPDATE sales."Weird ""T"""');
    expect(sql).toContain('name = $1');
    expect(sql).toContain('meta = $2');
    expect(sql).toContain('WHERE id = $3 AND "a b" = $4');
    expect(deletePreviewSql('a', 'dup', { id: 1 })).toBe('DELETE FROM a.dup WHERE id = $1;');
  });

  it('JSON view round-trips a draft and forces _id back to the original', () => {
    const original = { id: '1', _id: 'sales_customer/1', name: 'Acme', meta: null, balance: null, active: null };
    const text = draftToJsonText(original, fields);
    expect(JSON.parse(text)).toEqual(original);
    const edited = text.replace('"Acme"', '"Beta"').replace('sales_customer/1', 'hacked/9');
    const r = parseDraft(edited, fields, original);
    expect('draft' in r && r.draft.name).toBe('Beta');
    expect('draft' in r && r.draft._id).toBe('sales_customer/1');
    expect(parseDraft('{', fields, original)).toHaveProperty('error');
    expect(parseDraft('[1]', fields, original)).toHaveProperty('error');
  });

  it('setPath updates nested objects and arrays immutably', () => {
    const v = { a: { b: [1, 2] } };
    const next = setPath(v, ['a', 'b', '1'], 'crm_tag/4');
    expect(next).toEqual({ a: { b: [1, 'crm_tag/4'] } });
    expect(v).toEqual({ a: { b: [1, 2] } });
    expect(setPath(null, ['x'], 1)).toEqual({ x: 1 });
  });

  it('coerceInput respects column kinds and empty→NULL only when it was NULL', () => {
    expect(coerceInput('', 'text', true)).toBeNull();
    expect(coerceInput('', 'text', false)).toBe('');
    expect(coerceInput('true', 'bool', false)).toBe(true);
    expect(coerceInput('{"a":1}', 'jsonb', false)).toEqual({ a: 1 });
    expect(coerceInput('1.10', 'numeric', false)).toBe('1.10');
  });

  it('orderFieldsForPreview puts keys, then name-like, then table order, capped', () => {
    const many = [f('zz', 'text'), f('email', 'text'), f('id', 'int4'), f('_id', 'text'), f('name', 'text'), ...Array.from({ length: 8 }, (_, i) => f(`c${i}`, 'text'))];
    const names = orderFieldsForPreview(many, ['id']).map((x) => x.name);
    expect(names.slice(0, 4)).toEqual(['id', '_id', 'email', 'name']);
    expect(names).toHaveLength(8);
  });
});
