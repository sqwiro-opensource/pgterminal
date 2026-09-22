import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useShallow } from 'zustand/react/shallow';
import { Plus } from 'lucide-react';
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button';
import { useStore } from '@renderer/store';
import { useCatalogEvents, type NodeKey } from '@renderer/store/catalog.slice';
import type { MenuEntry } from '@renderer/components/ui/ContextMenu';
import { ConfirmDialogHost } from '@renderer/components/ui/ConfirmDialog';
import { CreateTableDialogHost } from '@renderer/features/structure/CreateTableDialog';
import { createTreeActions, selectActiveConnectionId } from './actions';
import { menuFor, type ActionClass } from './contextMenus';
import { TreeNode } from './TreeNode';
import { flattenTree, type TreeRow, type TreeState } from './treeModel';
import { useTreeKeyboard } from './useTreeKeyboard';

export interface CatalogTreeProps {
  onEditConnection(id: string): void;
  onNewConnection(group?: string): void;
}

const ROW_HEIGHT = 24;

const BADGE_CLASS: Record<ActionClass, string> = {
  DX: 'bg-success/15 text-success',
  DDL: 'bg-primary/12 text-link',
  CF: 'bg-destructive/12 text-destructive'
};

function classBadge(c: ActionClass): JSX.Element {
  return <span className={`rounded px-1 py-px font-mono text-[9px] font-bold ${BADGE_CLASS[c]}`}>{c}</span>;
}

export function CatalogTree({ onEditConnection, onNewConnection }: CatalogTreeProps): JSX.Element {
  useCatalogEvents();
  const s = useStore(
    useShallow((st) => ({
      connections: st.connections,
      status: st.status,
      nodes: st.nodes,
      loading: st.loading,
      errors: st.errors,
      expanded: st.expanded,
      filter: st.sidebarFilter,
      connect: st.connect,
      disconnect: st.disconnect,
      openDatabase: st.openDatabase,
      closeDatabase: st.closeDatabase,
      deleteConnection: st.deleteConnection,
      toggleExpanded: st.toggleExpanded,
      loadNode: st.loadNode,
      invalidate: st.invalidate,
      activeConnectionId: selectActiveConnectionId(st)
    }))
  );

  const actions = useMemo(
    () => createTreeActions({ editConnection: onEditConnection, newConnection: (group) => onNewConnection(group) }),
    [onEditConnection, onNewConnection]
  );

  const treeState: TreeState = useMemo(
    () => ({
      connections: s.connections,
      status: s.status,
      nodes: s.nodes,
      loading: s.loading,
      errors: s.errors,
      expanded: s.expanded,
      activeConnectionId: s.activeConnectionId
    }),
    [s.connections, s.status, s.nodes, s.loading, s.errors, s.expanded, s.activeConnectionId]
  );
  const rows = useMemo(() => flattenTree(treeState, s.filter), [treeState, s.filter]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  });

  const [selectedKey, setSelectedKey] = useState<NodeKey | null>(null);

  const toggle = useCallback(
    (row: TreeRow, force?: boolean) => {
      if (!row.hasChildren && force !== false) return;
      s.toggleExpanded(row.key, force);
    },
    [s]
  );

  const primary = useCallback(
    (row: TreeRow) => {
      const st = s.status[row.connectionId];
      if (row.kind === 'server') {
        if (st?.state === 'connected') toggle(row);
        else if (st?.state !== 'connecting') void s.connect(row.connectionId);
        return;
      }
      if (row.kind === 'database' && row.database) {
        if (row.isOpen) toggle(row);
        else {
          s.openDatabase(row.connectionId, row.database);
          s.toggleExpanded(row.key, true);
        }
        return;
      }
      if (row.kind === 'more') {
        s.toggleExpanded(row.key, true);
        return;
      }
      switch (row.kind) {
        case 'table':
        case 'partitionedTable':
        case 'foreignTable':
        case 'view':
        case 'matview':
          actions.openData(row);
          return;
        case 'function':
        case 'procedure':
          actions.ddlPreview(row);
          return;
        default:
          if (row.hasChildren) toggle(row);
      }
    },
    [s, toggle, actions]
  );

  const secondary = useCallback(
    (row: TreeRow) => {
      switch (row.kind) {
        case 'table':
        case 'partitionedTable':
        case 'foreignTable':
          actions.openStructure(row);
          return;
        case 'view':
        case 'matview':
          actions.openStructure(row, 'ddl');
          return;
        default:
          break;
      }
    },
    [actions]
  );

  const kb = useTreeKeyboard(rows, {
    toggle,
    primary,
    secondary,
    remove: (row) => {
      if (row.kind === 'server') actions.deleteConnection(row.connectionId);
      else if (menuFor(row, { actions }).some((m) => m.label.startsWith('Drop') && !m.disabled)) actions.confirmDrop(row);
    },
    rename: (row) => {
      if (['table', 'partitionedTable', 'foreignTable', 'view', 'matview', 'schema'].includes(row.kind)) actions.confirmRename(row);
    },
    scrollTo: (i) => virtualizer.scrollToIndex(i)
  });

  const select = useCallback(
    (row: TreeRow) => {
      setSelectedKey(row.key);
      const i = rows.findIndex((r) => r.key === row.key);
      if (i >= 0) kb.setFocusIndex(i);
    },
    [rows, kb]
  );

  // keep the focused row inside the list when rows change
  useEffect(() => {
    if (kb.focusIndex > rows.length - 1) kb.setFocusIndex(Math.max(0, rows.length - 1));
  }, [rows.length, kb]);

  const menu = useCallback(
    (row: TreeRow): MenuEntry[] =>
      menuFor(row, {
        actions,
        meta: s.connections[row.connectionId],
        connState: s.status[row.connectionId]?.state,
        badge: classBadge
      }),
    [actions, s.connections, s.status]
  );


  if (Object.keys(s.connections).length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center text-[12px] text-muted-foreground">
        <p>No connections</p>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-[12px]" onClick={() => onNewConnection()}>
          <Plus size={14} strokeWidth={1.75} /> New connection
        </Button>
      </div>
    );
  }

  return (
    <>
      <div
        ref={parentRef}
        role="tree"
        aria-label="Connections"
        className="flex-1 overflow-auto py-0.5 outline-none"
        onKeyDown={kb.onKeyDown}
        tabIndex={rows.length === 0 ? 0 : -1}
      >
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
          {virtualizer.getVirtualItems().map((v) => {
            const row = rows[v.index]!;
            return (
              <TreeNode
                key={row.key}
                row={row}
                style={{ transform: `translateY(${v.start}px)`, height: v.size }}
                selected={row.key === selectedKey}
                focused={v.index === kb.focusIndex}
                menu={menu(row)}
                onSelect={select}
                onToggle={toggle}
                onPrimary={primary}
              />
            );
          })}
        </div>
        {rows.length === 0 && s.filter && (
          <p className="mt-6 text-center text-[12px] text-muted-foreground">No matches for “{s.filter}”</p>
        )}
      </div>

      <ConfirmDialogHost />
      <CreateTableDialogHost />
    </>
  );
}
