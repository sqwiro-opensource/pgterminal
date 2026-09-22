import { describe, expect, it } from 'vitest';
import { fuzzyFilter, fuzzyFilterMulti, fuzzyScore } from '../../../src/renderer/src/lib/fuzzy';

describe('fuzzyScore', () => {
  it('returns 0 for an empty query and null when not a subsequence', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
    expect(fuzzyScore('xyz', 'sales_customer')).toBeNull();
    expect(fuzzyScore('toolong', 'abc')).toBeNull();
  });

  it('matches a subsequence in order only', () => {
    expect(fuzzyScore('sc', 'sales_customer')).not.toBeNull();
    // `r` is the last character, so nothing can follow it.
    expect(fuzzyScore('rs', 'sales_customer')).toBeNull();
    expect(fuzzyScore('ua', 'auth_user')).toBeNull();
  });

  it('ranks word-boundary matches above mid-word ones (sc → sales_customer)', () => {
    const boundary = fuzzyScore('sc', 'sales_customer');
    const midWord = fuzzyScore('sc', 'schema_cache');
    expect(boundary).not.toBeNull();
    expect(midWord).not.toBeNull();
    expect(boundary as number).toBeGreaterThan(midWord as number);
  });

  it('rewards exact prefixes', () => {
    const prefix = fuzzyScore('sales', 'sales_customer');
    const scattered = fuzzyScore('sales', 'summaries_all_e_s');
    expect(prefix as number).toBeGreaterThan(scattered as number);
  });

  it('prefers shorter targets on equal match quality', () => {
    const short = fuzzyScore('user', 'users') as number;
    const long = fuzzyScore('user', 'users_with_a_very_long_name') as number;
    expect(short).toBeGreaterThan(long);
  });

  it('is case-insensitive and handles camelCase boundaries', () => {
    expect(fuzzyScore('SC', 'sales_customer')).not.toBeNull();
    const camel = fuzzyScore('sc', 'salesCustomer') as number;
    const plain = fuzzyScore('sc', 'salescustomer') as number;
    expect(camel).toBeGreaterThan(plain);
  });
});

describe('fuzzyFilter', () => {
  const items = ['sales_customer', 'schema_cache', 'sales_order', 'auth_user'];

  it('keeps only matches, ranked best first', () => {
    const out = fuzzyFilter(items, 'sc', (s) => s).map((m) => m.item);
    expect(out[0]).toBe('sales_customer');
    expect(out).toContain('schema_cache');
    expect(out).not.toContain('auth_user');
  });

  it('returns the original order (truncated) for an empty query', () => {
    expect(fuzzyFilter(items, '', (s) => s, 2).map((m) => m.item)).toEqual(['sales_customer', 'schema_cache']);
  });

  it('respects the limit', () => {
    expect(fuzzyFilter(items, 's', (s) => s, 2)).toHaveLength(2);
  });
});

describe('fuzzyFilterMulti', () => {
  const rows = [
    { name: 'sales_customer', qualified: 'sales.sales_customer' },
    { name: 'orders', qualified: 'billing.orders' }
  ];

  it('matches on any key and prefers the first key on ties', () => {
    const out = fuzzyFilterMulti(rows, 'orders', (r) => [r.name, r.qualified]);
    expect(out[0]?.item.name).toBe('orders');
  });

  it('finds items only reachable through the secondary key', () => {
    const out = fuzzyFilterMulti(rows, 'billing', (r) => [r.name, r.qualified]);
    expect(out).toHaveLength(1);
    expect(out[0]?.item.name).toBe('orders');
  });
});
