import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompletionIndex } from '../../../src/shared/types/catalog';
import type { DocLinkResolution } from '../../../src/shared/types/doclink';

const index: CompletionIndex = {
  searchPath: ['pgui', 'public'],
  relations: [
    { schema: 'sales', name: 'sales_customer', kind: 'table', columns: [{ name: 'id', type: 'int4', isPk: true }] },
    { schema: 'public', name: 'users', kind: 'table', columns: [{ name: 'id', type: 'uuid', isPk: true }] }
  ],
  builtAt: 0
};

const resolveMock = vi.fn<(req: unknown) => Promise<DocLinkResolution>>();
const on = vi.fn(() => () => undefined);

vi.stubGlobal('window', { pgui: { 'doclink:resolve': resolveMock, on }, __pguiStore: undefined, addEventListener: () => undefined });
vi.stubGlobal('document', undefined);

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const { useStore } = await import('../../../src/renderer/src/store');
const { docLinks } = await import('../../../src/renderer/src/features/doclink/docLinksService');
const { chipVariantFor, splitChipLabel } = await import('../../../src/renderer/src/features/doclink/DocLinkChip');
const { deriveFkChips, fkChipRaw } = await import('../../../src/renderer/src/features/doclink/fkChips');
const { isLinkShaped } = await import('../../../src/renderer/src/lib/format');

const ctx = { connectionId: 'c1', database: 'db' };

describe('docLinks service', () => {
  beforeEach(() => {
    resolveMock.mockReset();
    docLinks.clearCache();
    useStore.setState({ completionIndex: { 'c1/db': index } });
  });

  it('isRef memoises parseDocRef and installs the grid link detector', () => {
    expect(docLinks.isRef('sales_customer/42')?.table).toBe('sales_customer');
    expect(docLinks.isRef('a/b/c')).toBeNull();
    expect(isLinkShaped('users/1')).toBe(true);
    expect(isLinkShaped('http://x/y')).toBe(false);
  });

  it('candidates rank against the cached completion index', () => {
    const c = docLinks.candidates(docLinks.isRef('sales_customer/1')!, 'c1', 'db');
    expect(c[0]?.schema).toBe('sales');
    expect(c[0]?.reason).toBe('prefixedName');
    expect(docLinks.candidates(docLinks.isRef('nosuch/1')!, 'c1', 'db')).toEqual([]);
  });

  it('resolve caches found results and negatives, and clearCache drops them', async () => {
    const found: DocLinkResolution = {
      status: 'found',
      target: { schema: 'sales', table: 'sales_customer', keyColumn: 'id', keyValue: '1', rank: 1, reason: 'prefixedName' },
      row: { id: '1' },
      fields: []
    };
    resolveMock.mockResolvedValueOnce(found).mockResolvedValueOnce({ status: 'notFound', candidates: [] });
    const ref = docLinks.isRef('sales_customer/1')!;
    expect(await docLinks.resolve(ref, ctx)).toBe(found);
    expect(await docLinks.resolve(ref, ctx)).toBe(found);
    expect(resolveMock).toHaveBeenCalledTimes(1);
    const miss = docLinks.isRef('sales_customer/999')!;
    expect((await docLinks.resolve(miss, ctx)).status).toBe('notFound');
    expect((await docLinks.resolve(miss, ctx)).status).toBe('notFound');
    expect(resolveMock).toHaveBeenCalledTimes(2);
    docLinks.clearCache('c1', 'db');
    resolveMock.mockResolvedValueOnce(found);
    await docLinks.resolve(ref, ctx);
    expect(resolveMock).toHaveBeenCalledTimes(3);
  });

  it('open pushes onto a document tab history in place, or opens a reused tab', async () => {
    const target = { schema: 'sales', table: 'sales_customer', keyColumn: '_id', keyValue: 'sales_customer/2', rank: 1, reason: 'prefixedName' as const };
    resolveMock.mockResolvedValue({ status: 'found', target, row: {}, fields: [] });
    const first = useStore.getState().openTab('document', { connectionId: 'c1', database: 'db', history: [{ ...target, keyValue: 'sales_customer/1' }], index: 0, view: 'tree' });
    await docLinks.open(docLinks.isRef('sales_customer/2')!, { ...ctx, fromTabId: first });
    const tab = useStore.getState().tabs.find((t) => t.id === first)!;
    const params = tab.params as { history: unknown[]; index: number };
    expect(params.history).toHaveLength(2);
    expect(params.index).toBe(1);
    expect(tab.title).toBe('sales_customer/sales_customer/2');
    await docLinks.open(docLinks.isRef('sales_customer/2')!, { ...ctx, fromTabId: first, newTab: true });
    expect(useStore.getState().tabs.filter((t) => t.kind === 'document')).toHaveLength(2);
  });

  it('opens a new document tab in the view last chosen, json until one is chosen', async () => {
    const target = { schema: 'sales', table: 'sales_customer', keyColumn: '_id', keyValue: 'sales_customer/7', rank: 1, reason: 'prefixedName' as const };
    resolveMock.mockResolvedValue({ status: 'found', target, row: {}, fields: [] });
    useStore.getState().closeAll();
    await docLinks.open(docLinks.isRef('sales_customer/7')!, ctx);
    const opened = (): string => {
      const tab = useStore.getState().tabs.find((t) => t.kind === 'document')!;
      return (tab.params as { view: string }).view;
    };
    expect(opened()).toBe('json');

    useStore.setState((s) => ({ settings: { ...s.settings, documentView: 'tree' } }));
    useStore.getState().closeAll();
    await docLinks.open(docLinks.isRef('sales_customer/7')!, ctx);
    expect(opened()).toBe('tree');
    useStore.getState().closeAll();
  });

  it('chip variants: normal when resolvable, broken otherwise, derived when forced', () => {
    expect(chipVariantFor('sales_customer/1', 'c1', 'db')).toBe('normal');
    expect(chipVariantFor('nosuch/1', 'c1', 'db')).toBe('broken');
    expect(chipVariantFor('sales_customer/1', 'c1', 'db', true)).toBe('derived');
    expect(chipVariantFor('not a ref', 'c1', 'db')).toBeNull();
    expect(splitChipLabel('sales_customer/42')).toEqual({ prefix: 'sales_', rest: 'customer/42' });
    expect(splitChipLabel('sales.customer/42')).toEqual({ prefix: 'sales.', rest: 'customer/42' });
    expect(splitChipLabel('users/42')).toEqual({ prefix: '', rest: 'users/42' });
  });

  it('FK derivation only for sole-column FKs when the setting is on', () => {
    const fields = [{ name: 'customer_id', dataType: 'int4', dataTypeID: 0, tableID: 0, columnID: 0 }];
    const fk = { customer_id: { schema: 'sales', table: 'sales_customer' } };
    expect(deriveFkChips(fields, fk, true)).toEqual(fk);
    expect(deriveFkChips(fields, fk, false)).toEqual({});
    expect(fkChipRaw(fk.customer_id, 42)).toBe('sales.sales_customer/42');
    expect(fkChipRaw(fk.customer_id, null)).toBeNull();
    expect(fkChipRaw(fk.customer_id, 'a b')).toBeNull();
  });
});
