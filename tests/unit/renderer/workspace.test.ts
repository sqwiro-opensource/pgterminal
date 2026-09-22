import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabParamsByKind, WorkspaceSnapshot } from '../../../src/shared/types/workspace';

// Minimal preload stand-in: the store calls window.pgui lazily.
const saved: WorkspaceSnapshot[] = [];
let loadResult: WorkspaceSnapshot | null = null;
vi.stubGlobal('window', {
  pgui: {
    'workspace:load': async () => loadResult,
    'workspace:save': async (s: WorkspaceSnapshot) => {
      saved.push(s);
    },
    'settings:get': async () => ({}),
    on: () => () => undefined
  }
});
vi.stubGlobal('navigator', { platform: 'MacIntel', clipboard: { writeText: async () => undefined } });

const { useStore } = await import('../../../src/renderer/src/store');
const { buildSnapshot } = await import('../../../src/renderer/src/store/persist');

const doc = (keyValue: string): TabParamsByKind['document'] => ({
  connectionId: 'c1',
  database: 'db',
  history: [{ schema: 'sales', table: 'sales_customer', keyColumn: '_id', keyValue, rank: 1, reason: 'prefixedName' }],
  index: 0,
  view: 'tree'
});
const data = (table: string): TabParamsByKind['table-data'] => ({
  connectionId: 'c1',
  database: 'db',
  schema: 'sales',
  table,
  filters: [],
  sort: [],
  page: { mode: 'offset', offset: 0 }
});
const s = (): ReturnType<typeof useStore.getState> => useStore.getState();

beforeEach(() => {
  useStore.setState({ tabs: [], activeTabId: null, recentlyClosed: [], workspaceLoaded: true, tabRuntime: {} });
  saved.length = 0;
});

describe('workspace slice', () => {
  it('PROP-14: snapshot survives a JSON round-trip and contains no functions', () => {
    s().openTab('table-data', data('a'));
    s().openTab('document', doc('42'));
    s().setDirty('document:c1/db/sales/sales_customer/42', true);
    const snap = buildSnapshot();
    const round = JSON.parse(JSON.stringify(snap)) as WorkspaceSnapshot;
    expect(round).toEqual(snap);
    const walk = (v: unknown): void => {
      expect(typeof v).not.toBe('function');
      if (v && typeof v === 'object') Object.values(v as object).forEach(walk);
    };
    walk(snap);
    expect('tabRuntime' in snap).toBe(false);
  });

  it('reuses by id: document key 42 twice → one tab, key 43 → second', () => {
    s().openTab('document', doc('42'));
    s().openTab('document', doc('42'));
    expect(s().tabs).toHaveLength(1);
    s().openTab('document', doc('43'));
    expect(s().tabs).toHaveLength(2);
    expect(s().activeTabId).toBe('document:c1/db/sales/sales_customer/43');
    s().openTab('document', doc('42'), { reuse: false });
    expect(s().tabs).toHaveLength(2); // same id replaced, not duplicated
  });

  it('closing the active tab activates the right neighbour, else the left', () => {
    const a = s().openTab('table-data', data('a'));
    const b = s().openTab('table-data', data('b'));
    const c = s().openTab('table-data', data('c'));
    s().setActive(b);
    s().closeTab(b);
    expect(s().activeTabId).toBe(c);
    s().closeTab(c);
    expect(s().activeTabId).toBe(a);
    s().closeTab(a);
    expect(s().activeTabId).toBeNull();
  });

  it('closeOthers keeps pinned tabs; closeRight and closeAll respect pins', () => {
    const a = s().openTab('table-data', data('a'));
    const b = s().openTab('table-data', data('b'));
    const c = s().openTab('table-data', data('c'));
    s().togglePin(a);
    expect(s().tabs[0]?.id).toBe(a);
    s().closeOthers(c);
    expect(s().tabs.map((t) => t.id)).toEqual([a, c]);
    expect(s().activeTabId).toBe(c);
    s().openTab('table-data', data('b'));
    s().closeRight(c);
    expect(s().tabs.map((t) => t.id)).toEqual([a, c]);
    s().closeAll();
    expect(s().tabs.map((t) => t.id)).toEqual([a]);
    expect(s().activeTabId).toBe(a);
    expect(b).toBeDefined();
  });

  it('reopenClosed restores params and title; cap at 20', () => {
    const id = s().openTab('table-data', data('z'), { title: 'Zed' });
    s().updateParams<'table-data'>(id, { filters: [{ column: 'id', op: 'gt', value: 5 }] });
    s().closeTab(id);
    expect(s().tabs).toHaveLength(0);
    s().reopenClosed();
    const t = s().tabs[0];
    expect(t?.id).toBe(id);
    expect(t?.title).toBe('Zed');
    expect((t?.params as TabParamsByKind['table-data']).filters).toHaveLength(1);
    for (let i = 0; i < 25; i++) s().closeTab(s().openTab('table-data', data(`t${i}`)));
    expect(s().recentlyClosed).toHaveLength(20);
  });

  it('reorder moves tabs; pinned stay first', () => {
    const a = s().openTab('table-data', data('a'));
    const b = s().openTab('table-data', data('b'));
    const c = s().openTab('table-data', data('c'));
    s().reorder(0, 2);
    expect(s().tabs.map((t) => t.id)).toEqual([b, c, a]);
    s().togglePin(a);
    expect(s().tabs.map((t) => t.id)).toEqual([a, b, c]);
    s().reorder(1, 0);
    expect(s().tabs[0]?.id).toBe(a);
  });

  it('activateOffset wraps; activateIndex 8 → last', () => {
    const a = s().openTab('table-data', data('a'));
    const b = s().openTab('table-data', data('b'));
    const c = s().openTab('table-data', data('c'));
    s().setActive(c);
    s().activateOffset(1);
    expect(s().activeTabId).toBe(a);
    s().activateOffset(-1);
    expect(s().activeTabId).toBe(c);
    s().activateIndex(1);
    expect(s().activeTabId).toBe(b);
    s().activateIndex(8);
    expect(s().activeTabId).toBe(c);
  });

  it('loadWorkspace restores tabs and a valid active tab', async () => {
    loadResult = {
      version: 1,
      tabs: [
        { id: 'connections', kind: 'connections', title: 'Connections', params: {}, dirty: false, pinned: false, createdAt: 1 },
        { id: 'table-data:c1/db/sales/x', kind: 'table-data', title: 'x', params: data('x'), dirty: true, pinned: true, createdAt: 2 }
      ],
      activeTabId: 'nope',
      sidebar: { width: 25, expandedNodeIds: [], activeConnectionId: null }
    };
    await s().loadWorkspace();
    expect(s().tabs.map((t) => t.id)).toEqual(['table-data:c1/db/sales/x', 'connections']);
    expect(s().activeTabId).toBe('table-data:c1/db/sales/x');
    expect(s().sidebarWidth).toBe(25);
    expect(s().workspaceLoaded).toBe(true);
  });

  it('openConnectionsView opens the connections tab and sets the edit target', () => {
    s().openConnectionsView('c9');
    expect(s().tabs.map((t) => t.kind)).toEqual(['connections']);
    expect(s().editingConnectionId).toBe('c9');
    s().openConnectionsView(null);
    expect(s().tabs).toHaveLength(1);
  });
});
