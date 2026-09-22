import { describe, expect, it } from 'vitest';
import { docLinkUrl } from '../../../src/renderer/src/features/editor/docLinkUrl';

/**
 * Monaco hands the opener a parsed Uri, so the url the link provider builds has to survive a
 * round trip through URI parsing and come back as the same reference and context.
 */
describe('docLinkUrl', () => {
  const parse = (url: string): { raw: string; conn: string | null; db: string | null } => {
    const u = new URL(url);
    return {
      raw: decodeURIComponent(url.slice('pgui-doc://'.length).split('?')[0] ?? ''),
      conn: u.searchParams.get('conn'),
      db: u.searchParams.get('db')
    };
  };

  it('round-trips a plain reference', () => {
    const out = parse(docLinkUrl('sales_customer/42', { connectionId: 'c1', database: 'pgui_test' }));
    expect(out).toEqual({ raw: 'sales_customer/42', conn: 'c1', db: 'pgui_test' });
  });

  it('survives keys and databases that need encoding', () => {
    const url = docLinkUrl("sales.customer/it's/odd", { connectionId: 'c 1', database: 'my db', tabId: 'document:x/y' });
    const out = parse(url);
    expect(out.raw).toBe("sales.customer/it's/odd");
    expect(out.conn).toBe('c 1');
    expect(out.db).toBe('my db');
    expect(new URL(url).searchParams.get('tab')).toBe('document:x/y');
  });

  it('keeps the scheme the opener matches on', () => {
    expect(docLinkUrl('a/1', { connectionId: 'c', database: 'd' }).startsWith('pgui-doc://')).toBe(true);
    expect(new URL(docLinkUrl('a/1', { connectionId: 'c', database: 'd' })).protocol).toBe('pgui-doc:');
  });
});
