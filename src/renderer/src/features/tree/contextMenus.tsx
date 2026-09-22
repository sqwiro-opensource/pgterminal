/**
 * Data-driven context menus for every tree level. Pure: no store access, no DOM. Every item either
 * calls an action or is disabled with a visible reason. Action classes: DX (runs now), DDL (opens
 * SQL in a tab), CF (confirm dialog).
 */
import type { ReactNode } from 'react';
import type { ConnectionMeta } from '@shared/types/connection';
import type { MenuEntry } from '@renderer/components/ui/ContextMenu';
import type { TreeRow } from './treeModel';

export type ActionClass = 'DX' | 'DDL' | 'CF';

/** What the menus can trigger. Implemented by features/tree/actions.ts; faked in tests. */
export interface TreeActionApi {
  // connections
  connect(id: string): void;
  disconnect(id: string): void;
  refreshDatabases(id: string): void;
  setReadOnly(id: string, on: boolean): void;
  editConnection(id: string): void;
  duplicateConnection(id: string): void;
  copyUri(id: string): void;
  deleteConnection(id: string): void;
  newConnectionInGroup(group: string): void;
  connectAll(group: string): void;
  disconnectAll(group: string): void;
  collapse(row: TreeRow): void;
  // navigation / DX
  openDatabase(row: TreeRow): void;
  closeDatabase(row: TreeRow): void;
  refreshNode(row: TreeRow): void;
  copyName(row: TreeRow): void;
  copyQualifiedName(row: TreeRow): void;
  copyChildNames(row: TreeRow): void;
  openData(row: TreeRow): void;
  openStructure(row: TreeRow, section?: 'columns' | 'indexes' | 'constraints' | 'triggers' | 'ddl'): void;
  openOverview(id: string): void;
  newQuery(row: TreeRow): void;
  refreshMatview(row: TreeRow, concurrently: boolean): void;
  // DDL
  ddlPreview(row: TreeRow): void;
  generate(row: TreeRow, kind: 'select' | 'insert' | 'update' | 'delete'): void;
  createTemplate(row: TreeRow, what: 'table' | 'view' | 'function' | 'schema' | 'database' | 'extension'): void;
  editView(row: TreeRow): void;
  editFunction(row: TreeRow): void;
  selectFromFunction(row: TreeRow): void;
  // CF
  confirmDrop(row: TreeRow): void;
  confirmTruncate(row: TreeRow): void;
  confirmRename(row: TreeRow): void;
  confirmRestartSequence(row: TreeRow): void;
}

export interface MenuContext {
  actions: TreeActionApi;
  meta?: ConnectionMeta;
  connState?: 'idle' | 'connecting' | 'connected' | 'error';
  /** Renders the small class tag; tests pass undefined. */
  badge?: (c: ActionClass) => ReactNode;
}

const LATER: Record<string, string> = {
  doc: 'Phase 4',
  export: 'Phase 5',
  inspector: 'Phase 7',
  structureEdit: 'Phase 5'
};

function later(label: string, key: keyof typeof LATER, extra: Partial<MenuEntry> = {}): MenuEntry {
  return { label, disabled: true, reason: LATER[key], ...extra };
}

export function menuFor(row: TreeRow, ctx: MenuContext): MenuEntry[] {
  const a = ctx.actions;
  const b = ctx.badge ?? (() => undefined);
  const connected = ctx.connState === 'connected';
  const readOnly = ctx.meta?.readOnly === true;
  const writeGuard = (): Partial<MenuEntry> =>
    readOnly ? { disabled: true, reason: 'Read-only connection' } : !connected ? { disabled: true, reason: 'Connect first' } : {};
  const connGuard = (): Partial<MenuEntry> => (connected ? {} : { disabled: true, reason: 'Connect first' });

  switch (row.kind) {
    case 'group': {
      const g = row.label === 'Ungrouped' ? '' : row.label;
      return [
        { label: 'New connection here', onSelect: () => a.newConnectionInGroup(g) },
        later('Rename group', 'inspector'),
        { label: 'Connect all', onSelect: () => a.connectAll(g), separatorBefore: true },
        { label: 'Disconnect all', onSelect: () => a.disconnectAll(g) },
        { label: 'Collapse', onSelect: () => a.collapse(row), separatorBefore: true }
      ];
    }
    case 'server': {
      const id = row.connectionId;
      const common: MenuEntry[] = [
        { label: 'Edit connection…', onSelect: () => a.editConnection(id), separatorBefore: true },
        { label: 'Duplicate', onSelect: () => a.duplicateConnection(id) },
        { label: 'Copy URI (no password)', onSelect: () => a.copyUri(id) },
        { label: 'Delete', danger: true, badge: b('CF'), onSelect: () => a.deleteConnection(id), separatorBefore: true }
      ];
      if (connected) {
        return [
          { label: 'Open overview', badge: b('DX'), onSelect: () => a.openOverview(id) },
          { label: 'New query', onSelect: () => a.newQuery(row) },
          { label: 'Disconnect', onSelect: () => a.disconnect(id), separatorBefore: true },
          { label: 'Refresh databases', badge: b('DX'), onSelect: () => a.refreshDatabases(id) },
          { label: readOnly ? 'Unset read-only' : 'Set read-only', badge: b('DX'), onSelect: () => a.setReadOnly(id, !readOnly) },
          ...common
        ];
      }
      const connecting = ctx.connState === 'connecting';
      return [
        { label: connecting ? 'Connecting…' : 'Connect', disabled: connecting, reason: connecting ? 'in progress' : undefined, onSelect: () => a.connect(id) },
        ...common
      ];
    }
    case 'database':
      if (!row.isOpen) {
        return [
          { label: 'Open', onSelect: () => a.openDatabase(row) },
          { label: 'New query', onSelect: () => a.newQuery(row), ...connGuard() },
          { label: 'Create database…', badge: b('DDL'), onSelect: () => a.createTemplate(row, 'database'), ...writeGuard(), separatorBefore: true },
          { label: 'Drop database', danger: true, badge: b('CF'), onSelect: () => a.confirmDrop(row), ...writeGuard() },
          later('Properties', 'inspector', { separatorBefore: true })
        ];
      }
      return [
        { label: 'New query', onSelect: () => a.newQuery(row) },
        { label: 'Refresh', badge: b('DX'), onSelect: () => a.refreshNode(row) },
        { label: 'Close', onSelect: () => a.closeDatabase(row) },
        { label: 'Create schema…', badge: b('DDL'), onSelect: () => a.createTemplate(row, 'schema'), ...writeGuard(), separatorBefore: true },
        { label: 'Create extension…', badge: b('DDL'), onSelect: () => a.createTemplate(row, 'extension'), ...writeGuard() },
        { label: 'Drop database', danger: true, badge: b('CF'), onSelect: () => a.confirmDrop(row), ...writeGuard(), separatorBefore: true },
        later('Properties', 'inspector', { separatorBefore: true })
      ];
    case 'schema':
      return [
        { label: 'New query', onSelect: () => a.newQuery(row) },
        { label: 'Create table…', badge: b('DDL'), onSelect: () => a.createTemplate(row, 'table'), ...writeGuard(), separatorBefore: true },
        { label: 'Create view…', badge: b('DDL'), onSelect: () => a.createTemplate(row, 'view'), ...writeGuard() },
        { label: 'Create function…', badge: b('DDL'), onSelect: () => a.createTemplate(row, 'function'), ...writeGuard() },
        { label: 'Refresh', badge: b('DX'), onSelect: () => a.refreshNode(row), separatorBefore: true },
        { label: 'Rename…', badge: b('CF'), onSelect: () => a.confirmRename(row), ...writeGuard() },
        { label: 'Copy name', onSelect: () => a.copyName(row) },
        { label: 'Drop schema', danger: true, badge: b('CF'), onSelect: () => a.confirmDrop(row), ...writeGuard(), separatorBefore: true },
        later('Properties', 'inspector', { separatorBefore: true })
      ];
    case 'tablesGroup':
    case 'viewsGroup':
    case 'functionsGroup':
    case 'sequencesGroup':
    case 'typesGroup':
    case 'extensionsGroup': {
      const creatable: Partial<Record<TreeRow['kind'], 'table' | 'view' | 'function' | 'extension'>> = {
        tablesGroup: 'table',
        viewsGroup: 'view',
        functionsGroup: 'function',
        extensionsGroup: 'extension'
      };
      const what = creatable[row.kind];
      return [
        what
          ? { label: `New ${what}…`, badge: b('DDL'), onSelect: () => a.createTemplate(row, what), ...writeGuard() }
          : later(`New ${row.label.toLowerCase().replace(/s$/, '')}…`, 'structureEdit'),
        { label: 'Refresh', badge: b('DX'), onSelect: () => a.refreshNode(row) },
        { label: 'Copy list of names', onSelect: () => a.copyChildNames(row) }
      ];
    }
    case 'columnsGroup':
    case 'indexesGroup':
    case 'constraintsGroup':
    case 'triggersGroup':
      return [
        later(`Add ${row.label.toLowerCase().replace(/s$/, '')}…`, 'structureEdit'),
        { label: 'Refresh', badge: b('DX'), onSelect: () => a.refreshNode(row) },
        { label: 'Copy list of names', onSelect: () => a.copyChildNames(row) }
      ];
    case 'table':
    case 'partitionedTable':
    case 'foreignTable':
      return [
        { label: 'Open data', shortcut: '↵', onSelect: () => a.openData(row) },
        { label: 'Open structure', shortcut: '⌘↵', onSelect: () => a.openStructure(row) },
        later('Open document by id…', 'doc'),
        { label: 'New query with SELECT', badge: b('DDL'), onSelect: () => a.generate(row, 'select'), separatorBefore: true },
        {
          label: 'Generate SQL',
          badge: b('DDL'),
          children: [
            { label: 'SELECT', onSelect: () => a.generate(row, 'select') },
            { label: 'INSERT', onSelect: () => a.generate(row, 'insert') },
            { label: 'UPDATE', onSelect: () => a.generate(row, 'update') },
            { label: 'DELETE', onSelect: () => a.generate(row, 'delete') },
            { label: 'CREATE', onSelect: () => a.ddlPreview(row) }
          ]
        },
        { label: 'Copy name', onSelect: () => a.copyName(row), separatorBefore: true },
        { label: 'Copy qualified name', onSelect: () => a.copyQualifiedName(row) },
        later('Export data…', 'export', { separatorBefore: true }),
        later('Import from CSV…', 'export'),
        { label: 'Rename…', badge: b('CF'), onSelect: () => a.confirmRename(row), ...writeGuard(), separatorBefore: true },
        { label: 'Truncate', danger: true, badge: b('CF'), onSelect: () => a.confirmTruncate(row), ...writeGuard() },
        { label: 'Drop', danger: true, badge: b('CF'), onSelect: () => a.confirmDrop(row), ...writeGuard() },
        { label: 'Refresh', badge: b('DX'), onSelect: () => a.refreshNode(row), separatorBefore: true },
        later('Properties', 'inspector')
      ];
    case 'view':
    case 'matview': {
      const items: MenuEntry[] = [
        { label: 'Open data', shortcut: '↵', onSelect: () => a.openData(row) },
        { label: 'Show definition', shortcut: '⌘↵', onSelect: () => a.openStructure(row, 'ddl') },
        { label: 'Edit definition', badge: b('DDL'), onSelect: () => a.editView(row), ...writeGuard() },
        { label: 'Generate SELECT', badge: b('DDL'), onSelect: () => a.generate(row, 'select') }
      ];
      if (row.kind === 'matview') {
        items.push(
          { label: 'Refresh data', badge: b('DX'), onSelect: () => a.refreshMatview(row, false), ...writeGuard(), separatorBefore: true },
          { label: 'Refresh data concurrently', badge: b('DX'), onSelect: () => a.refreshMatview(row, true), ...writeGuard() }
        );
      }
      items.push(
        { label: 'Copy name', onSelect: () => a.copyName(row), separatorBefore: true },
        { label: 'Copy qualified name', onSelect: () => a.copyQualifiedName(row) },
        { label: 'Rename…', badge: b('CF'), onSelect: () => a.confirmRename(row), ...writeGuard(), separatorBefore: true },
        { label: 'Drop', danger: true, badge: b('CF'), onSelect: () => a.confirmDrop(row), ...writeGuard() },
        { label: 'Refresh', badge: b('DX'), onSelect: () => a.refreshNode(row), separatorBefore: true },
        later('Properties', 'inspector')
      );
      return items;
    }
    case 'function':
    case 'procedure':
      return [
        { label: 'Show source', shortcut: '↵', onSelect: () => a.ddlPreview(row) },
        { label: 'Edit', badge: b('DDL'), onSelect: () => a.editFunction(row), ...writeGuard() },
        { label: 'Execute…', badge: b('DDL'), onSelect: () => a.selectFromFunction(row), ...connGuard() },
        { label: 'Copy signature', onSelect: () => a.copyQualifiedName(row), separatorBefore: true },
        { label: 'Drop', danger: true, badge: b('CF'), onSelect: () => a.confirmDrop(row), ...writeGuard(), separatorBefore: true }
      ];
    case 'sequence':
      return [
        later('Properties', 'inspector'),
        later('Set value…', 'structureEdit'),
        { label: 'Restart', badge: b('CF'), onSelect: () => a.confirmRestartSequence(row), ...writeGuard(), separatorBefore: true },
        { label: 'Drop', danger: true, badge: b('CF'), onSelect: () => a.confirmDrop(row), ...writeGuard() }
      ];
    case 'type':
      return [
        { label: 'Copy name', onSelect: () => a.copyName(row) },
        later('Add enum value…', 'structureEdit'),
        { label: 'Drop', danger: true, badge: b('CF'), onSelect: () => a.confirmDrop(row), ...writeGuard(), separatorBefore: true }
      ];
    case 'extension':
      return [
        later('Details', 'inspector'),
        later('Update to latest', 'structureEdit'),
        { label: 'Drop', danger: true, badge: b('CF'), onSelect: () => a.confirmDrop(row), ...writeGuard(), separatorBefore: true }
      ];
    case 'column':
      return [
        { label: 'Copy name', onSelect: () => a.copyName(row) },
        later('Open data filtered by…', 'export'),
        later('Edit…', 'structureEdit'),
        { label: 'Drop column', danger: true, badge: b('CF'), onSelect: () => a.confirmDrop(row), ...writeGuard(), separatorBefore: true }
      ];
    case 'index':
    case 'constraint':
    case 'trigger':
      return [
        { label: 'Show DDL', onSelect: () => a.ddlPreview(row) },
        { label: 'Copy name', onSelect: () => a.copyName(row) },
        { label: 'Drop', danger: true, badge: b('CF'), onSelect: () => a.confirmDrop(row), ...writeGuard(), separatorBefore: true }
      ];
    case 'more':
    case 'hint':
    case 'connection':
    default:
      return [];
  }
}
