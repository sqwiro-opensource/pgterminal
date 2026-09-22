import { describe, expect, it } from 'vitest';
import { formatDocRef, parseDocRef } from '../../src/shared/doclink/parseDocRef';

describe('parseDocRef (PROP-01..03)', () => {
  it('accepts the fleet forms', () => {
    expect(parseDocRef('sales_customer/42')).toEqual({ raw: 'sales_customer/42', schemaHint: null, table: 'sales_customer', key: '42' });
    expect(parseDocRef('users/42')).toEqual({ raw: 'users/42', schemaHint: null, table: 'users', key: '42' });
    expect(parseDocRef('sales.sales_customer/42')).toEqual({ raw: 'sales.sales_customer/42', schemaHint: 'sales', table: 'sales_customer', key: '42' });
    expect(parseDocRef('users/550e8400-e29b-41d4-a716-446655440000')?.key).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(parseDocRef("t/O'Brien:x@y.z(1)+,=;$!*%")?.key).toBe("O'Brien:x@y.z(1)+,=;$!*%");
  });

  it('rejects non-refs', () => {
    for (const bad of ['', 'a/b/c', '/42', 'x/', 'http://h/p', 'a b/1', '1abc/2', 'x/y z', 'a.b.c/1', '.t/1', 't/k"q', 't/k#1', 'a/b\n']) {
      expect(parseDocRef(bad), bad).toBeNull();
    }
    expect(parseDocRef(null)).toBeNull();
    expect(parseDocRef(42)).toBeNull();
    expect(parseDocRef({ a: 1 })).toBeNull();
    expect(parseDocRef(`${'t'.repeat(64)}/1`)).toBeNull();
    expect(parseDocRef(`${'t'.repeat(63)}/1`)).not.toBeNull();
    expect(parseDocRef(`t/${'k'.repeat(255)}`)).toBeNull();
    expect(parseDocRef(`t/${'k'.repeat(254)}`)).not.toBeNull();
    expect(parseDocRef(`${'s'.repeat(63)}.${'t'.repeat(63)}/${'k'.repeat(254)}`)).toBeNull(); // > 320 chars
  });

  it('reconstructs raw from parts for generated valid inputs', () => {
    const ident = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789';
    const keyChars = `${ident}-:.@()+,=;$!*'%`;
    let seed = 12345;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const mkIdent = () => {
      const len = 1 + rnd(20);
      let s = ident[rnd(53)] ?? 'a'; // letter or underscore first
      for (let i = 1; i < len; i++) s += ident[rnd(ident.length)];
      return s;
    };
    const mkKey = () => {
      const len = 1 + rnd(40);
      let s = '';
      for (let i = 0; i < len; i++) s += keyChars[rnd(keyChars.length)];
      return s;
    };
    for (let i = 0; i < 200; i++) {
      const schemaHint = rnd(2) === 0 ? mkIdent() : null;
      const raw = formatDocRef({ schemaHint, table: mkIdent(), key: mkKey() });
      const parsed = parseDocRef(raw);
      expect(parsed, raw).not.toBeNull();
      expect(formatDocRef(parsed!)).toBe(raw);
      expect(parsed!.raw).toBe(raw);
      expect(parsed!.schemaHint).toBe(schemaHint);
    }
  });
});
