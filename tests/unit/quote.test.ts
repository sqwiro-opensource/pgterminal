import { describe, expect, it } from 'vitest';
import { qualify, quoteIdent, quoteLiteral } from '../../src/shared/sql/quote';

describe('quoteIdent', () => {
  it('quotes when needed and doubles embedded quotes', () => {
    expect(quoteIdent('a"b')).toBe('"a""b"');
    expect(quoteIdent('Select')).toBe('"Select"');
    expect(quoteIdent('naïve')).toBe('"naïve"');
    expect(quoteIdent('x y')).toBe('"x y"');
    expect(quoteIdent('1abc')).toBe('"1abc"');
  });
  it('leaves simple lower-case identifiers bare', () => {
    expect(quoteIdent('simple')).toBe('simple');
    expect(quoteIdent('sales_customer')).toBe('sales_customer');
    expect(quoteIdent('_id')).toBe('_id');
  });
  it('quotes reserved words', () => {
    expect(quoteIdent('user')).toBe('"user"');
    expect(quoteIdent('order')).toBe('"order"');
    expect(quoteIdent('table')).toBe('"table"');
  });
});

describe('qualify / quoteLiteral', () => {
  it('qualifies with schema', () => {
    expect(qualify('sales', 'sales_customer')).toBe('sales.sales_customer');
    expect(qualify('My Schema', 'user')).toBe('"My Schema"."user"');
    expect(qualify(undefined, 'x')).toBe('x');
  });
  it('quotes literals', () => {
    expect(quoteLiteral("it's")).toBe("'it''s'");
    expect(quoteLiteral(null)).toBe('NULL');
  });
});
