import { describe, expect, it } from 'vitest';
import { stringTokenValue, tokenizeJson } from '../../../src/renderer/src/features/grid/jsonTokens';

const round = (text: string): string => tokenizeJson(text).map((t) => t.text).join('');

describe('tokenizeJson', () => {
  it('reproduces the input exactly', () => {
    const text = JSON.stringify({ a: 1, b: 'x', c: [true, null, -2.5e3], d: { e: '' } }, null, 2);
    expect(round(text)).toBe(text);
  });

  it('classifies keys apart from string values', () => {
    const toks = tokenizeJson('{\n  "name": "Acme"\n}');
    expect(toks.find((t) => t.text === '"name"')?.kind).toBe('key');
    expect(toks.find((t) => t.text === '"Acme"')?.kind).toBe('string');
    expect(toks.filter((t) => t.kind === 'punct').map((t) => t.text)).toEqual(['{', ':', '}']);
  });

  it('classifies literals and numbers', () => {
    const kinds = Object.fromEntries(tokenizeJson('[true, false, null, 42, -2.5e3]').filter((t) => t.kind !== 'space' && t.kind !== 'punct').map((t) => [t.text, t.kind]));
    expect(kinds).toEqual({ true: 'boolean', false: 'boolean', null: 'null', '42': 'number', '-2.5e3': 'number' });
  });

  it('does not mistake braces or colons inside strings for structure', () => {
    const text = JSON.stringify({ 'a:b': '{"not":"json"}', esc: 'say "hi"' }, null, 2);
    expect(round(text)).toBe(text);
    const toks = tokenizeJson(text);
    expect(toks.find((t) => t.text.includes('a:b'))?.kind).toBe('key');
    expect(toks.find((t) => t.text.includes('not'))?.kind).toBe('string');
  });

  it('reads a string token back to its value for link detection', () => {
    const tok = tokenizeJson('["sales_customer/42"]').find((t) => t.kind === 'string');
    expect(tok && stringTokenValue(tok)).toBe('sales_customer/42');
  });
});
