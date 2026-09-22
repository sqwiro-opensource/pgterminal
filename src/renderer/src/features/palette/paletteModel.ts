import type { PageSpec } from '@shared/types/rows';
import { useStore } from '@renderer/store';
import { docLinks } from '@renderer/features/doclink/docLinksService';
import { displayKeys, openNewQueryTab, RUNNABLE_BINDINGS, type PaletteMode } from '@renderer/lib/keybindings';
import { fuzzyFilterMulti } from '@renderer/lib/fuzzy';
import { getObjectIndex, type ObjectEntry } from './objectIndex';

/** One row in the palette. `run` performs the primary action; `runAlt` is ⌘↵. */
export interface PaletteItem {
  id: string;
  kind: 'object' | 'tab' | 'action' | 'document';
  label: string;
  /** Muted right-hand text: connection path or the binding. */
  detail?: string;
  hint?: string;
  icon: 'table' | 'view' | 'function' | 'sequence' | 'type' | 'tab' | 'action' | 'braces';
  run(): void;
  runAlt?(): void;
}

const FIRST_PAGE: PageSpec = { mode: 'keyset', after: null };
const RECENT_KEY = 'pgui.palette.recent';
const RECENT_CAP = 10;

export interface RecentRef {
  id: string;
  label: string;
  detail: string;
  kind: 'object' | 'document';
  /** Enough to reopen without the index. */
  payload: { connectionId: string; database: string; schema: string; name: string; raw?: string };
}

export function readRecents(): RecentRef[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentRef[]).slice(0, RECENT_CAP) : [];
  } catch {
    return [];
  }
}

export function pushRecent(entry: RecentRef): void {
  try {
    const next = [entry, ...readRecents().filter((r) => r.id !== entry.id)].slice(0, RECENT_CAP);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}

const OBJECT_ICON: Record<ObjectEntry['kind'], PaletteItem['icon']> = {
  table: 'table',
  partitionedTable: 'table',
  foreignTable: 'table',
  view: 'view',
  matview: 'view',
  function: 'function',
  sequence: 'sequence',
  type: 'type'
};

const RELATIONAL = new Set<ObjectEntry['kind']>(['table', 'view', 'matview', 'foreignTable', 'partitionedTable']);

function openObject(e: ObjectEntry, structure: boolean): void {
  const s = useStore.getState();
  pushRecent({
    id: e.id,
    label: e.qualified,
    detail: `${e.connectionName} › ${e.database}`,
    kind: 'object',
    payload: { connectionId: e.connectionId, database: e.database, schema: e.schema, name: e.name }
  });
  if (!RELATIONAL.has(e.kind)) {
    s.openTab('function', { connectionId: e.connectionId, database: e.database, schema: e.schema, name: e.name, args: '' });
    return;
  }
  if (structure) {
    s.openTab('table-structure', { connectionId: e.connectionId, database: e.database, schema: e.schema, table: e.name, section: 'columns' });
  } else {
    s.openTab('table-data', { connectionId: e.connectionId, database: e.database, schema: e.schema, table: e.name, filters: [], sort: [], page: FIRST_PAGE });
  }
}

export function objectItems(query: string, limit = 50): PaletteItem[] {
  const entries = getObjectIndex();
  return fuzzyFilterMulti(entries, query, (e) => [e.name, e.qualified], limit).map(({ item }) => ({
    id: `obj:${item.id}`,
    kind: 'object' as const,
    label: item.qualified,
    detail: `${item.connectionName} › ${item.database}`,
    hint: RELATIONAL.has(item.kind) ? '↵ data · ⌘↵ structure' : undefined,
    icon: OBJECT_ICON[item.kind],
    run: () => openObject(item, false),
    runAlt: RELATIONAL.has(item.kind) ? () => openObject(item, true) : undefined
  }));
}

export function tabItems(query: string): PaletteItem[] {
  const s = useStore.getState();
  return fuzzyFilterMulti(s.tabs, query, (t) => [t.title, t.id]).map(({ item }) => ({
    id: `tab:${item.id}`,
    kind: 'tab' as const,
    label: item.title,
    detail: item.kind,
    icon: 'tab' as const,
    run: () => useStore.getState().setActive(item.id)
  }));
}

/** Actions: every runnable binding plus connection and workspace commands. */
export function actionItems(query: string): PaletteItem[] {
  const s = useStore.getState();
  const actions: PaletteItem[] = RUNNABLE_BINDINGS.map((b) => ({
    id: `act:${b.id}`,
    kind: 'action' as const,
    label: b.label,
    detail: displayKeys(b),
    icon: 'action' as const,
    run: () => b.run?.()
  }));

  for (const meta of Object.values(s.connections)) {
    const connected = s.status[meta.id]?.state === 'connected';
    actions.push({
      id: `act:conn:${meta.id}`,
      kind: 'action',
      label: connected ? `Disconnect: ${meta.name}` : `Connect: ${meta.name}`,
      detail: `${meta.host}:${meta.port}`,
      icon: 'action',
      run: () => {
        const st = useStore.getState();
        if (connected) void st.disconnect(meta.id);
        else void st.connect(meta.id);
      }
    });
    if (connected) {
      actions.push({
        id: `act:overview:${meta.id}`,
        kind: 'action',
        label: `Server overview: ${meta.name}`,
        icon: 'action',
        run: () => useStore.getState().openTab('server-overview', { connectionId: meta.id })
      });
    }
  }

  actions.push(
    { id: 'act:new-connection', kind: 'action', label: 'New connection', icon: 'action', run: () => useStore.getState().openConnectionsView(null) },
    { id: 'act:manage-connections', kind: 'action', label: 'Manage connections', icon: 'action', run: () => useStore.getState().openConnectionsView(undefined) },
    { id: 'act:fleet', kind: 'action', label: 'Fleet overview', icon: 'action', run: () => useStore.getState().openTab('server-overview', { connectionId: 'all' }) },
    { id: 'act:new-query', kind: 'action', label: 'New query', icon: 'action', run: openNewQueryTab }
  );

  const unique = new Map(actions.map((a) => [a.label, a]));
  return fuzzyFilterMulti([...unique.values()], query, (a) => [a.label]).map(({ item }) => item);
}

/** `#` mode: resolve a typed `table/id` (or `schema.table/id`) reference. */
export function documentItems(query: string, ctx: { connectionId: string | null; database: string | null }): PaletteItem[] {
  const raw = query.trim();
  const ref = docLinks.isRef(raw);
  if (!ref || !ctx.connectionId || !ctx.database) return [];
  const { connectionId, database } = ctx;
  const candidates = docLinks.candidates(ref, connectionId, database);
  if (candidates.length === 0) {
    return [
      {
        id: 'doc:open',
        kind: 'document',
        label: raw,
        detail: 'resolve on open',
        icon: 'braces',
        run: () => void docLinks.open(ref, { connectionId, database })
      }
    ];
  }
  return candidates.map((c) => ({
    id: `doc:${c.schema}.${c.table}`,
    kind: 'document' as const,
    label: `${c.schema}.${c.table}/${ref.key}`,
    detail: c.reason,
    icon: 'braces' as const,
    run: () => {
      pushRecent({
        id: `${connectionId}/${database}/${c.schema}.${c.table}/${ref.key}`,
        label: `${c.table}/${ref.key}`,
        detail: `${database} · document`,
        kind: 'document',
        payload: { connectionId, database, schema: c.schema, name: c.table, raw: ref.raw }
      });
      void docLinks.open(ref, { connectionId, database, preferred: { schema: c.schema, table: c.table } });
    }
  }));
}

export function recentItems(): PaletteItem[] {
  return readRecents().map((r) => ({
    id: `recent:${r.id}`,
    kind: r.kind,
    label: r.label,
    detail: r.detail,
    icon: r.kind === 'document' ? ('braces' as const) : ('table' as const),
    run: () => {
      const s = useStore.getState();
      const { connectionId, database, schema, name, raw } = r.payload;
      if (r.kind === 'document' && raw) {
        const ref = docLinks.isRef(raw);
        if (ref) void docLinks.open(ref, { connectionId, database, preferred: { schema, table: name } });
        return;
      }
      s.openTab('table-data', { connectionId, database, schema, table: name, filters: [], sort: [], page: FIRST_PAGE });
    }
  }));
}

/** Splits the raw palette input into a mode and the remaining query. */
export function parseInput(value: string): { mode: PaletteMode; query: string } {
  const first = value.charAt(0);
  if (first === '@' || first === '#' || first === ':' || first === '>') return { mode: first, query: value.slice(1) };
  return { mode: '', query: value };
}

/** Builds the result list for the current mode. */
export function buildItems(mode: PaletteMode, query: string, ctx: { connectionId: string | null; database: string | null }): PaletteItem[] {
  switch (mode) {
    case '@':
      return objectItems(query);
    case '#':
      return documentItems(query, ctx);
    case ':':
      return tabItems(query);
    case '>':
      return actionItems(query);
    default: {
      if (query.length === 0) return [...recentItems(), ...tabItems('').slice(0, 5), ...actionItems('').slice(0, 6)];
      return [...objectItems(query, 20), ...tabItems(query).slice(0, 5), ...actionItems(query).slice(0, 8)];
    }
  }
}
