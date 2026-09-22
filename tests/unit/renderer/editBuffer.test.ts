import { describe, expect, it } from 'vitest';
import { DEFAULT_SENTINEL, type FieldInfo } from '../../../src/shared/types/query';
import { EMPTY_BUFFER, addInsert, changeCount, isDirty, markDelete, pendingCellKeys, revertCell, setCell, setDefault, setNull, toOps, toOpsWithRows, wireValue } from '../../../src/renderer/src/features/grid/editBuffer';

const f = (name: string, dataType: string): FieldInfo => ({ name, dataType, dataTypeID: 0, tableID: 0, columnID: 0 });
const fields = [f('id', 'int4'), f('t', 'text'), f('j', 'jsonb'), f('n', 'numeric')];
const row = ['1', 'hello', { a: 1 }, '1.10'];

describe('editBuffer', () => {
  it('sets, reverts and drops entries that equal the original', () => {
    let b = setCell(EMPTY_BUFFER, 'k1', row, 1, 't', 'world');
    expect(isDirty(b)).toBe(true);
    expect(pendingCellKeys(b).has('k1:t')).toBe(true);
    b = setCell(b, 'k1', row, 1, 't', 'hello');
    expect(isDirty(b)).toBe(false);
    b = setCell(b, 'k1', row, 1, 't', 'x');
    b = revertCell(b, 'k1', 't');
    expect(isDirty(b)).toBe(false);
  });
  it("NULL stays null, '' stays '', DEFAULT stays the sentinel (PROP-08/11)", () => {
    let b = setNull(EMPTY_BUFFER, 'k1', row, 1, 't');
    b = setCell(b, 'k2', row, 1, 't', '');
    b = setDefault(b, 'k3', row, 3, 'n');
    const ops = toOps(b, fields, ['id']);
    expect(ops[0]).toEqual({ op: 'update', pk: { id: '1' }, set: { t: null } });
    expect(ops[1]).toEqual({ op: 'update', pk: { id: '1' }, set: { t: '' } });
    expect(ops[2]).toEqual({ op: 'update', pk: { id: '1' }, set: { n: DEFAULT_SENTINEL } });
    expect(changeCount(b)).toBe(3);
  });
  it('keeps numeric strings verbatim and sends jsonb as raw JSON text', () => {
    let b = setCell(EMPTY_BUFFER, 'k1', row, 3, 'n', '12345678901234567890.123456789');
    b = setCell(b, 'k1', row, 2, 'j', { tier: 'gold' });
    const [op] = toOps(b, fields, ['id']);
    expect(op).toEqual({ op: 'update', pk: { id: '1' }, set: { n: '12345678901234567890.123456789', j: '{"tier":"gold"}' } });
    expect(wireValue('"str"', 'jsonb')).toBe('"str"');
    expect(wireValue(null, 'jsonb')).toBeNull();
  });
  it('orders ops update → insert → delete and resolves delete PKs from the row lookup', () => {
    let b = addInsert(EMPTY_BUFFER, { t: 'new', id: DEFAULT_SENTINEL });
    b = markDelete(b, 'k9');
    b = setCell(b, 'k1', row, 1, 't', 'z');
    const ops = toOpsWithRows(b, fields, ['id'], (k) => (k === 'k9' ? ['9', 'x', null, null] : undefined));
    expect(ops.map((o) => o.op)).toEqual(['update', 'insert', 'delete']);
    expect(ops[1]).toEqual({ op: 'insert', values: { t: 'new' } });
    expect(ops[2]).toEqual({ op: 'delete', pk: { id: '9' } });
  });
  it('throws when the PK is not in the result set (PROP-10: never a WHERE-less write)', () => {
    const b = setCell(EMPTY_BUFFER, 'k1', row, 1, 't', 'z');
    expect(() => toOps(b, fields, ['missing'])).toThrow();
  });
});
