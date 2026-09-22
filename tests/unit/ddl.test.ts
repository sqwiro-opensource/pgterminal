import { describe, expect, it } from 'vitest';
import { qualify, quoteIdent, quoteLiteral } from '@main/ddl/quote';

describe('quoteIdent (PROP-06)', () => {
  it('doubles embedded quotes', () => expect(quoteIdent('a"b')).toBe('"a""b"'));
  it('quotes mixed case', () => expect(quoteIdent('Select')).toBe('"Select"'));
  it('quotes non-ascii', () => expect(quoteIdent('naïve')).toBe('"naïve"'));
  it('quotes spaces', () => expect(quoteIdent('x y')).toBe('"x y"'));
  it('leaves simple names bare', () => expect(quoteIdent('simple_name')).toBe('simple_name'));
  it('quotes reserved words', () => expect(quoteIdent('select')).toBe('"select"'));
  it('qualifies schema.name', () => expect(qualify('sales', 'Weird Name')).toBe('sales."Weird Name"'));
  it('quotes literals', () => expect(quoteLiteral("it's")).toBe("'it''s'"));
});
