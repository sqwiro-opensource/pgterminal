import { describe, expect, it } from 'vitest';
import { docLinkUrl, parseDocLinkUrl } from '../../../src/renderer/src/features/editor/docLinkUrl';

/**
 * Monaco hands the opener a re-serialised Uri, so a url has to survive normalisation and come
 * back as the same reference and context. The reference contains a slash, which is what makes
 * this fragile.
 */
describe('doc link urls', () => {
  const ctx = { connectionId: 'c1', database: 'sqwiro-admin' };

  it('round-trips a reference containing a slash', () => {
    expect(parseDocLinkUrl(docLinkUrl('magneta_application/cron', ctx))).toEqual({
      raw: 'magneta_application/cron',
      connectionId: 'c1',
      database: 'sqwiro-admin'
    });
  });

  it('keeps the payload out of the authority', () => {
    expect(docLinkUrl('magneta_application/cron', ctx)).not.toContain('//magneta');
  });

  it('survives a url that was percent-encoded a second time', () => {
    // What a Uri round trip did to the old authority form: %2F became %252F.
    const doubled = docLinkUrl('magneta_application/cron', ctx).replace('magneta_application%2Fcron', 'magneta_application%252Fcron');
    expect(parseDocLinkUrl(doubled)?.raw).toBe('magneta_application/cron');
  });

  it('still reads the older authority form', () => {
    const legacy = `pgui-doc://${encodeURIComponent('sales_customer/42')}?conn=c1&db=sqwiro-admin`;
    expect(parseDocLinkUrl(legacy)).toEqual({ raw: 'sales_customer/42', connectionId: 'c1', database: 'sqwiro-admin' });
  });

  it('carries the originating tab when given one', () => {
    const url = docLinkUrl('a/1', { ...ctx, tabId: 'document:c1/db/s/t/1' });
    expect(parseDocLinkUrl(url)?.tabId).toBe('document:c1/db/s/t/1');
  });

  it('handles keys and databases that need encoding', () => {
    const url = docLinkUrl("sales.customer/it's-odd", { connectionId: 'c 1', database: 'my db' });
    expect(parseDocLinkUrl(url)).toEqual({ raw: "sales.customer/it's-odd", connectionId: 'c 1', database: 'my db' });
  });

  it('does not over-decode a tab id that legitimately contains a percent escape', () => {
    // Document tab ids embed an encoded key; decoding it twice would name a different tab.
    const tabId = 'document:c1/db/sales/sales_customer/sales_customer%2F2';
    expect(parseDocLinkUrl(docLinkUrl('a/1', { ...ctx, tabId }))?.tabId).toBe(tabId);
  });

  it('keeps a key that contains a percent escape intact', () => {
    expect(parseDocLinkUrl(docLinkUrl('t/a%2Fb', ctx))?.raw).toBe('t/a%2Fb');
  });

  it('rejects urls of another scheme or without context', () => {
    expect(parseDocLinkUrl('https://example.com/a/1?conn=c&db=d')).toBeNull();
    expect(parseDocLinkUrl('pgui-doc:/open?raw=a/1')).toBeNull();
  });
});
