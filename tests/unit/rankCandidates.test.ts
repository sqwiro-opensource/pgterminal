import { describe, expect, it } from 'vitest';
import type { CompletionIndex } from '../../src/shared/types/catalog';
import { parseDocRef } from '../../src/shared/doclink/parseDocRef';
import { isAmbiguous, rankCandidates } from '../../src/shared/doclink/rankCandidates';

function index(rels: Array<[string, string, string?]>, searchPath = ['public']): CompletionIndex {
  return {
    searchPath,
    builtAt: 0,
    relations: rels.map(([schema, name, kind]) => ({ schema, name, kind: kind ?? 'table', columns: [] }))
  };
}
const ref = (s: string) => parseDocRef(s)!;

describe('rankCandidates (PROP-05)', () => {
  const idx = index([
    ['sales', 'sales_customer'],
    ['sales', 'customer', 'view'],
    ['public', 'customer'],
    ['public', 'users'],
    ['a', 'dup'],
    ['b', 'dup'],
    ['sales', 'seq1', 'sequence'],
    ['sales', 'fn', 'function']
  ]);

  it('prefixedName wins for the fleet convention', () => {
    const c = rankCandidates(ref('sales_customer/1'), idx);
    expect(c[0]).toMatchObject({ schema: 'sales', table: 'sales_customer', rank: 1, reason: 'prefixedName', keyValue: '1', keyColumn: '' });
    expect(c[1]).toMatchObject({ schema: 'sales', table: 'customer', rank: 2, reason: 'strippedName' });
    expect(isAmbiguous(c)).toBe(false);
  });

  it('explicit schema ranks 0', () => {
    const c = rankCandidates(ref('sales.customer/1'), idx);
    expect(c[0]).toMatchObject({ schema: 'sales', table: 'customer', rank: 0, reason: 'explicit' });
    expect(c.map((x) => `${x.schema}.${x.table}`)).toEqual(['sales.customer', 'public.customer']);
  });

  it('searchPath before anySchema', () => {
    const c = rankCandidates(ref('customer/1'), idx);
    expect(c.map((x) => [`${x.schema}.${x.table}`, x.reason])).toEqual([
      ['public.customer', 'searchPath'],
      ['sales.customer', 'anySchema']
    ]);
    expect(isAmbiguous(c)).toBe(false);
  });

  it('dup/1 is ambiguous; unknown names yield nothing; non-relation kinds are ignored', () => {
    const c = rankCandidates(ref('dup/1'), idx);
    expect(c.map((x) => x.schema)).toEqual(['a', 'b']);
    expect(isAmbiguous(c)).toBe(true);
    expect(rankCandidates(ref('nosuch/1'), idx)).toEqual([]);
    expect(rankCandidates(ref('seq1/1'), idx)).toEqual([]);
    expect(rankCandidates(ref('sales_fn/1'), idx)).toEqual([]);
  });

  it('longest existing schema prefix wins for sales_customer_order/42', () => {
    const both = index([
      ['sales', 'sales_customer_order'],
      ['sales_customer', 'sales_customer_order']
    ]);
    const c = rankCandidates(ref('sales_customer_order/42'), both);
    expect(c[0]).toMatchObject({ schema: 'sales_customer', reason: 'prefixedName' });
    expect(c[1]).toMatchObject({ schema: 'sales', reason: 'prefixedName' });
    expect(isAmbiguous(c)).toBe(true); // both rank 1 → ambiguous, picker decides
    const onlySales = index([
      ['sales', 'sales_customer_order'],
      ['sales_customer', 'other']
    ]);
    const d = rankCandidates(ref('sales_customer_order/42'), onlySales);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ schema: 'sales', table: 'sales_customer_order', reason: 'prefixedName' });
    const stripped = index([['sales_customer', 'order']]);
    expect(rankCandidates(ref('sales_customer_order/42'), stripped)[0]).toMatchObject({ schema: 'sales_customer', table: 'order', reason: 'strippedName' });
  });

  it('appends public to the search path when absent and expands nothing else', () => {
    const c = rankCandidates(ref('users/1'), index([['public', 'users']], ['pgui']));
    expect(c[0]).toMatchObject({ schema: 'public', reason: 'searchPath' });
  });
});
