import { toast } from 'sonner';
import { activeConnectionId, useStore } from '../store';

/**
 * One source of truth for keyboard shortcuts: the dispatcher, the ⌘/ sheet and the palette's
 * `>` mode all read `BINDINGS`. Bindings are scoped by focus (editor > grid > tree > input >
 * global) so Monaco keeps ⌘↵ / ⌘⇧↵ / ⌘E / ⌘. / ⌘/ while the editor has focus.
 */

export type Scope = 'global' | 'editor' | 'grid' | 'tree' | 'input';
export type BindingGroup = 'Global' | 'Tabs' | 'Editor' | 'Grid' | 'Tree' | 'Document & links';

/** A single key chord. `mod` is ⌘ on macOS and Ctrl elsewhere; `ctrl` is always literal Ctrl. */
export interface Chord {
  key: string;
  mod?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface Binding {
  id: string;
  label: string;
  group: BindingGroup;
  /** Focus scopes in which the binding fires. Display-only bindings use this for documentation. */
  scopes: Scope[];
  /** Chords per platform; matching uses the current platform's list. */
  chords: { mac: Chord[]; win: Chord[] };
  /** Display glyphs per platform. */
  keys: { mac: string; win: string };
  /** Action. Omitted when another component owns the key (Monaco, the grid, the tree). */
  run?: () => void;
  /** Who handles the key when `run` is omitted; shown in the shortcut sheet. */
  ownedBy?: string;
}

export const isMac = /Mac/i.test(navigator.platform);

/** Primary modifier: ⌘ on mac, Ctrl elsewhere. */
export function primaryMod(e: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey'>): boolean {
  return isMac ? e.metaKey : e.ctrlKey;
}

/** True when the event target is a plain text input (not Monaco, which is its own scope). */
export function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest('input, textarea, select, [contenteditable="true"], .monaco-editor') !== null;
}

/** Focus scope of an event, most specific first. */
export function scopeOf(target: EventTarget | null): Scope {
  if (!(target instanceof HTMLElement)) return 'global';
  if (target.closest('.monaco-editor')) return 'editor';
  if (target.closest('[role="grid"]')) return 'grid';
  if (target.closest('[role="tree"]')) return 'tree';
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return 'input';
  return 'global';
}

/**
 * True when the event matches the chord on the given platform. Every modifier is compared
 * exactly, so ⌘K never fires for ⌘⇧K and Ctrl+Tab never fires for ⌘⌥Tab.
 */
export function matchesChord(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>, c: Chord, mac = isMac): boolean {
  if (e.key.toLowerCase() !== c.key.toLowerCase()) return false;
  if (Boolean(c.shift) !== e.shiftKey) return false;
  if (Boolean(c.alt) !== e.altKey) return false;
  const wantMeta = mac ? Boolean(c.mod) : false;
  const wantCtrl = c.ctrl !== undefined ? c.ctrl : !mac && Boolean(c.mod);
  return e.metaKey === wantMeta && e.ctrlKey === wantCtrl;
}

// ---- actions ---------------------------------------------------------------------------------

/** Opens a query tab on the active tab's connection/database, else the first connected server. */
export function openNewQueryTab(): void {
  const s = useStore.getState();
  const active = s.tabs.find((t) => t.id === s.activeTabId);
  let connectionId = activeConnectionId(s);
  let database = (active?.params as { database?: string } | undefined)?.database;
  if (!connectionId || s.status[connectionId]?.state !== 'connected') {
    connectionId = Object.keys(s.status).find((id) => s.status[id]?.state === 'connected') ?? null;
    database = undefined;
  }
  if (!connectionId) {
    toast.info('Connect to a server first');
    return;
  }
  const meta = s.connections[connectionId];
  s.openTab(
    'query',
    { connectionId, database: database ?? meta?.defaultDatabase ?? 'postgres', sessionId: crypto.randomUUID(), sql: '' },
    { reuse: false }
  );
}

export type PaletteMode = '' | '@' | '#' | ':' | '>';

/** Palette and shortcut-sheet visibility live outside the store: they are pure UI chrome. */
const paletteListeners = new Set<(mode: PaletteMode | null) => void>();
const sheetListeners = new Set<(open: boolean) => void>();

export function onPaletteRequest(fn: (mode: PaletteMode | null) => void): () => void {
  paletteListeners.add(fn);
  return () => paletteListeners.delete(fn);
}
export function openPalette(mode: PaletteMode = ''): void {
  paletteListeners.forEach((fn) => fn(mode));
}
export function onShortcutSheetRequest(fn: (open: boolean) => void): () => void {
  sheetListeners.add(fn);
  return () => sheetListeners.delete(fn);
}
export function openShortcutSheet(open = true): void {
  sheetListeners.forEach((fn) => fn(open));
}

/** Asks the active tab to reload. Tabs subscribe with `useRefreshSignal`. */
export const REFRESH_TAB_EVENT = 'pgterminal:refresh-tab';
export function requestTabRefresh(tabId?: string | null): void {
  const id = tabId ?? useStore.getState().activeTabId;
  if (!id) return;
  window.dispatchEvent(new CustomEvent(REFRESH_TAB_EVENT, { detail: { tabId: id } }));
}

function focusSelector(selector: string): void {
  const el = document.querySelector(selector);
  if (el instanceof HTMLElement) el.focus();
}

/**
 * The theme lives in a React context; the provider's toggle is registered here so the shortcut
 * and the palette drive the same state instead of poking at the DOM class.
 */
let themeToggle: (() => void) | null = null;
export function setThemeToggle(fn: (() => void) | null): void {
  themeToggle = fn;
}
function toggleTheme(): void {
  themeToggle?.();
}

// ---- the table -------------------------------------------------------------------------------

const EVERYWHERE: Scope[] = ['global', 'editor', 'grid', 'tree', 'input'];
const OUTSIDE_TEXT: Scope[] = ['global', 'editor', 'grid', 'tree'];
const NOT_EDITOR: Scope[] = ['global', 'grid', 'tree'];

function chord(key: string, mods: Omit<Chord, 'key'> = {}): Chord {
  return { key, ...mods };
}

/** Every binding the app knows about. `run` omitted = documented but owned by another component. */
export const BINDINGS: Binding[] = [
  {
    id: 'palette',
    label: 'Command palette',
    group: 'Global',
    scopes: EVERYWHERE,
    chords: { mac: [chord('k', { mod: true })], win: [chord('k', { mod: true })] },
    keys: { mac: '⌘K', win: 'Ctrl+K' },
    run: () => openPalette('')
  },
  {
    id: 'palette.tables',
    label: 'Open table',
    group: 'Global',
    scopes: EVERYWHERE,
    chords: { mac: [chord('p', { mod: true })], win: [chord('p', { mod: true })] },
    keys: { mac: '⌘P', win: 'Ctrl+P' },
    run: () => openPalette('@')
  },
  {
    id: 'palette.document',
    label: 'Go to document',
    group: 'Global',
    scopes: EVERYWHERE,
    chords: { mac: [chord('d', { mod: true, shift: true })], win: [chord('d', { mod: true, shift: true })] },
    keys: { mac: '⌘⇧D', win: 'Ctrl+Shift+D' },
    run: () => openPalette('#')
  },
  {
    id: 'shortcuts',
    label: 'All shortcuts',
    group: 'Global',
    scopes: NOT_EDITOR,
    chords: { mac: [chord('/', { mod: true })], win: [chord('/', { mod: true })] },
    keys: { mac: '⌘/', win: 'Ctrl+/' },
    run: () => openShortcutSheet(true)
  },
  {
    id: 'tab.new',
    label: 'New query',
    group: 'Tabs',
    scopes: EVERYWHERE,
    chords: { mac: [chord('n', { mod: true })], win: [chord('n', { mod: true })] },
    keys: { mac: '⌘N', win: 'Ctrl+N' },
    run: openNewQueryTab
  },
  {
    id: 'tab.close',
    label: 'Close tab',
    group: 'Tabs',
    scopes: EVERYWHERE,
    chords: { mac: [chord('w', { mod: true })], win: [chord('w', { mod: true })] },
    keys: { mac: '⌘W', win: 'Ctrl+W' },
    run: () => {
      const s = useStore.getState();
      if (s.activeTabId) s.closeTab(s.activeTabId);
    }
  },
  {
    id: 'tab.reopen',
    label: 'Reopen closed tab',
    group: 'Tabs',
    scopes: EVERYWHERE,
    chords: { mac: [chord('t', { mod: true, shift: true })], win: [chord('t', { mod: true, shift: true })] },
    keys: { mac: '⌘⇧T', win: 'Ctrl+Shift+T' },
    run: () => useStore.getState().reopenClosed()
  },
  {
    id: 'tab.next',
    label: 'Next tab',
    group: 'Tabs',
    scopes: EVERYWHERE,
    chords: {
      mac: [chord('tab', { ctrl: true }), chord('arrowright', { mod: true, alt: true })],
      win: [chord('tab', { ctrl: true })]
    },
    keys: { mac: '⌃Tab / ⌘⌥→', win: 'Ctrl+Tab' },
    run: () => useStore.getState().activateOffset(1)
  },
  {
    id: 'tab.prev',
    label: 'Previous tab',
    group: 'Tabs',
    scopes: EVERYWHERE,
    chords: {
      mac: [chord('tab', { ctrl: true, shift: true }), chord('arrowleft', { mod: true, alt: true })],
      win: [chord('tab', { ctrl: true, shift: true })]
    },
    keys: { mac: '⌃⇧Tab / ⌘⌥←', win: 'Ctrl+Shift+Tab' },
    run: () => useStore.getState().activateOffset(-1)
  },
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map<Binding>((n) => ({
    id: `tab.index.${n}`,
    label: n === 1 ? 'Go to tab 1–9' : `Go to tab ${n}`,
    group: 'Tabs',
    scopes: OUTSIDE_TEXT,
    chords: { mac: [chord(String(n), { mod: true })], win: [chord(String(n), { alt: true })] },
    keys: { mac: '⌘1–9', win: 'Alt+1–9' },
    run: () => useStore.getState().activateIndex(n - 1)
  })),
  {
    id: 'view.sidebar',
    label: 'Toggle sidebar',
    group: 'Global',
    scopes: OUTSIDE_TEXT,
    chords: { mac: [chord('b', { mod: true })], win: [chord('b', { mod: true })] },
    keys: { mac: '⌘B', win: 'Ctrl+B' },
    run: () => {
      const s = useStore.getState();
      s.setSidebarCollapsed(!s.sidebarCollapsed);
    }
  },
  {
    id: 'view.inspector',
    label: 'Toggle inspector',
    group: 'Global',
    scopes: OUTSIDE_TEXT,
    chords: { mac: [chord('i', { mod: true })], win: [chord('i', { mod: true })] },
    keys: { mac: '⌘I', win: 'Ctrl+I' },
    run: () => {
      const s = useStore.getState();
      s.setInspectorVisible(!s.inspectorVisible);
    }
  },
  {
    id: 'focus.treeFilter',
    label: 'Focus tree filter',
    group: 'Tree',
    scopes: NOT_EDITOR,
    chords: { mac: [chord('f', { mod: true, shift: true })], win: [chord('f', { mod: true, shift: true })] },
    keys: { mac: '⌘⇧F', win: 'Ctrl+Shift+F' },
    run: () => {
      useStore.getState().setSidebarCollapsed(false);
      focusSelector('aside input[type="text"]');
    }
  },
  {
    id: 'focus.tree',
    label: 'Focus object tree',
    group: 'Tree',
    scopes: OUTSIDE_TEXT,
    chords: { mac: [chord('0', { mod: true })], win: [chord('0', { mod: true })] },
    keys: { mac: '⌘0', win: 'Ctrl+0' },
    run: () => {
      useStore.getState().setSidebarCollapsed(false);
      focusSelector('[role="tree"] [role="treeitem"][tabindex="0"], [role="tree"]');
    }
  },
  {
    id: 'tab.refresh',
    label: 'Refresh tab',
    group: 'Global',
    scopes: OUTSIDE_TEXT,
    chords: { mac: [chord('r', { mod: true })], win: [chord('f5')] },
    keys: { mac: '⌘R', win: 'F5' },
    run: () => requestTabRefresh()
  },
  {
    id: 'history',
    label: 'Query history',
    group: 'Global',
    scopes: EVERYWHERE,
    chords: { mac: [chord('h', { mod: true, shift: true })], win: [chord('h', { mod: true, shift: true })] },
    keys: { mac: '⌘⇧H', win: 'Ctrl+Shift+H' },
    run: () => useStore.getState().toggleHistory()
  },
  {
    id: 'settings',
    label: 'Settings',
    group: 'Global',
    scopes: OUTSIDE_TEXT,
    chords: { mac: [chord(',', { mod: true })], win: [chord(',', { mod: true })] },
    keys: { mac: '⌘,', win: 'Ctrl+,' },
    run: () => useStore.getState().openTab('settings', {})
  },
  {
    id: 'theme',
    label: 'Toggle theme',
    group: 'Global',
    scopes: OUTSIDE_TEXT,
    chords: { mac: [chord('l', { mod: true, shift: true })], win: [chord('l', { mod: true, shift: true })] },
    keys: { mac: '⌘⇧L', win: 'Ctrl+Shift+L' },
    run: toggleTheme
  },

  // Documented, owned elsewhere ------------------------------------------------------------------
  { id: 'editor.run', label: 'Run all', group: 'Editor', scopes: ['editor'], chords: { mac: [], win: [] }, keys: { mac: '⌘↵', win: 'Ctrl+Enter' }, ownedBy: 'Editor' },
  { id: 'editor.runSel', label: 'Run selection or statement', group: 'Editor', scopes: ['editor'], chords: { mac: [], win: [] }, keys: { mac: '⌘⇧↵', win: 'Ctrl+Shift+Enter' }, ownedBy: 'Editor' },
  { id: 'editor.explain', label: 'Explain', group: 'Editor', scopes: ['editor'], chords: { mac: [], win: [] }, keys: { mac: '⌘E', win: 'Ctrl+E' }, ownedBy: 'Editor' },
  { id: 'editor.cancel', label: 'Cancel query', group: 'Editor', scopes: ['editor'], chords: { mac: [], win: [] }, keys: { mac: '⌘. / Esc', win: 'Ctrl+.' }, ownedBy: 'Editor' },
  { id: 'editor.format', label: 'Format SQL', group: 'Editor', scopes: ['editor'], chords: { mac: [], win: [] }, keys: { mac: '⌘⇧F', win: 'Ctrl+Shift+F' }, ownedBy: 'Editor' },
  { id: 'editor.comment', label: 'Toggle comment', group: 'Editor', scopes: ['editor'], chords: { mac: [], win: [] }, keys: { mac: '⌘/', win: 'Ctrl+/' }, ownedBy: 'Editor' },
  { id: 'grid.apply', label: 'Apply pending changes', group: 'Grid', scopes: ['grid'], chords: { mac: [], win: [] }, keys: { mac: '⌘S', win: 'Ctrl+S' }, ownedBy: 'Table data' },
  { id: 'grid.revert', label: 'Revert cell', group: 'Grid', scopes: ['grid'], chords: { mac: [], win: [] }, keys: { mac: '⌘Z', win: 'Ctrl+Z' }, ownedBy: 'Table data' },
  { id: 'grid.edit', label: 'Edit cell / commit / cancel', group: 'Grid', scopes: ['grid'], chords: { mac: [], win: [] }, keys: { mac: 'Enter or F2 / ↵,Tab / Esc', win: 'same' }, ownedBy: 'Grid' },
  { id: 'grid.copy', label: 'Copy cell / row as JSON', group: 'Grid', scopes: ['grid'], chords: { mac: [], win: [] }, keys: { mac: '⌘C / ⌘⇧C', win: 'Ctrl+C / Ctrl+Shift+C' }, ownedBy: 'Grid' },
  { id: 'grid.null', label: 'Set NULL', group: 'Grid', scopes: ['grid'], chords: { mac: [], win: [] }, keys: { mac: '⌘⇧⌫', win: 'Ctrl+Shift+Delete' }, ownedBy: 'Table data' },
  { id: 'grid.page', label: 'Next / previous page', group: 'Grid', scopes: ['grid'], chords: { mac: [], win: [] }, keys: { mac: '⌘⌥↓ / ⌘⌥↑', win: 'Ctrl+Alt+Down / Up' }, ownedBy: 'Table data' },
  { id: 'tree.move', label: 'Expand / collapse / move', group: 'Tree', scopes: ['tree'], chords: { mac: [], win: [] }, keys: { mac: '→ ← ↑ ↓', win: 'same' }, ownedBy: 'Tree' },
  { id: 'tree.open', label: 'Open data / structure', group: 'Tree', scopes: ['tree'], chords: { mac: [], win: [] }, keys: { mac: '↵ / ⌘↵', win: 'Enter / Ctrl+Enter' }, ownedBy: 'Tree' },
  { id: 'tree.drop', label: 'Drop / rename object', group: 'Tree', scopes: ['tree'], chords: { mac: [], win: [] }, keys: { mac: '⌫ / F2', win: 'Delete / F2' }, ownedBy: 'Tree' },
  { id: 'doc.nav', label: 'Back / forward', group: 'Document & links', scopes: ['global'], chords: { mac: [], win: [] }, keys: { mac: '⌘[ / ⌘]', win: 'Alt+Left / Alt+Right' }, ownedBy: 'Document tab' },
  { id: 'doc.view', label: 'Tree / JSON view', group: 'Document & links', scopes: ['global'], chords: { mac: [], win: [] }, keys: { mac: '⌘⇧J', win: 'Ctrl+Shift+J' }, ownedBy: 'Document tab' },
  { id: 'doc.link', label: 'Open link / new tab / peek', group: 'Document & links', scopes: ['global'], chords: { mac: [], win: [] }, keys: { mac: 'click / ⌘click / ⇧click', win: 'click / Ctrl+click / Shift+click' }, ownedBy: 'Link chips' }
];

/** Bindings that actually run something, for the palette's `>` mode and the dispatcher. */
export const RUNNABLE_BINDINGS = BINDINGS.filter((b) => b.run !== undefined);

/** Platform key glyphs for display. */
export function displayKeys(b: Binding): string {
  return isMac ? b.keys.mac : b.keys.win;
}

/** Finds the binding a key event triggers in the given scope, if any. */
export function findBinding(e: KeyboardEvent, scope: Scope, bindings: Binding[] = BINDINGS): Binding | undefined {
  return bindings.find((b) => {
    if (b.run === undefined) return false;
    if (!b.scopes.includes(scope)) return false;
    const chords = isMac ? b.chords.mac : b.chords.win;
    return chords.some((c) => matchesChord(e, c));
  });
}

/**
 * Runs a binding by id, for the application menu. Returns false when the id is unknown or the
 * binding is documentation-only, so a caller can report a menu item that no longer maps to anything.
 */
export function runBindingById(id: string, bindings: Binding[] = BINDINGS): boolean {
  const binding = bindings.find((b) => b.id === id);
  if (!binding?.run) return false;
  binding.run();
  return true;
}

/** Installs the single window-level dispatcher. Returns an unsubscribe function. */
export function installKeybindings(): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    const scope = scopeOf(e.target);
    const binding = findBinding(e, scope);
    if (!binding?.run) return;
    e.preventDefault();
    binding.run();
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
