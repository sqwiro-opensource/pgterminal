import {
  Blocks,
  Boxes,
  Braces,
  Columns3,
  Database,
  Eye,
  Glasses,
  Hash,
  Hexagon,
  KeyRound,
  Layers,
  Link2,
  ListChecks,
  ListOrdered,
  ListTree,
  Puzzle,
  Server,
  Shapes,
  Sheet,
  ShieldCheck,
  Sigma,
  SquareFunction,
  Table,
  Table2,
  Workflow,
  Zap,
  type LucideIcon
} from 'lucide-react';
import type { NodeKind } from '@shared/types/catalog';

/**
 * Every kind that gets an icon. `server` and `extensionsGroup` are tree-only rows that have no
 * catalog node of their own, so they sit alongside `NodeKind` here.
 */
export type IconKind = NodeKind | 'server' | 'extensionsGroup';

export interface IconOptions {
  /**
   * Accepted for call-site convenience; expansion is shown by the chevron, so it no longer
   * changes the icon — a folder keeps the icon of what it holds whether open or closed.
   */
  expanded?: boolean;
  /** A column that is part of the primary key. */
  pk?: boolean;
}

/**
 * One icon and one colour per kind, so the tree, tab strip, command palette, structure tabs and
 * link chips never disagree about what a view or a function looks like.
 *
 * The records are exhaustive over `IconKind`: adding a kind to the catalog breaks the typecheck
 * here rather than silently falling back to a generic folder.
 */
const ICONS: Record<IconKind, LucideIcon> = {
  connection: Server,
  server: Server,
  database: Database,
  schema: Boxes,
  tablesGroup: Sheet,
  viewsGroup: Glasses,
  functionsGroup: Sigma,
  typesGroup: Shapes,
  sequencesGroup: ListOrdered,
  columnsGroup: Table,
  indexesGroup: ListChecks,
  constraintsGroup: ShieldCheck,
  triggersGroup: Workflow,
  extensionsGroup: Blocks,
  table: Table2,
  partitionedTable: Table2,
  foreignTable: Table2,
  view: Eye,
  matview: Layers,
  column: Columns3,
  index: ListTree,
  constraint: Link2,
  trigger: Zap,
  function: SquareFunction,
  procedure: SquareFunction,
  sequence: Hash,
  type: Hexagon,
  extension: Puzzle
};

const COLORS: Record<IconKind, string> = {
  connection: 'text-icon-server',
  server: 'text-icon-server',
  database: 'text-icon-database',
  schema: 'text-icon-schema',
  tablesGroup: 'text-icon-table',
  viewsGroup: 'text-icon-view',
  functionsGroup: 'text-icon-function',
  typesGroup: 'text-icon-type',
  sequencesGroup: 'text-icon-sequence',
  columnsGroup: 'text-icon-column',
  indexesGroup: 'text-icon-index',
  constraintsGroup: 'text-icon-constraint',
  triggersGroup: 'text-icon-trigger',
  extensionsGroup: 'text-icon-extension',
  table: 'text-icon-table',
  partitionedTable: 'text-icon-partitioned',
  foreignTable: 'text-icon-foreign',
  view: 'text-icon-view',
  matview: 'text-icon-matview',
  column: 'text-icon-column',
  index: 'text-icon-index',
  constraint: 'text-icon-constraint',
  trigger: 'text-icon-trigger',
  function: 'text-icon-function',
  procedure: 'text-icon-function',
  sequence: 'text-icon-sequence',
  type: 'text-icon-type',
  extension: 'text-icon-extension'
};

/** Human label, used in tooltips and the command palette. */
export const KIND_LABEL: Record<IconKind, string> = {
  connection: 'Connection',
  server: 'Server',
  database: 'Database',
  schema: 'Schema',
  tablesGroup: 'Tables',
  viewsGroup: 'Views',
  functionsGroup: 'Functions',
  typesGroup: 'Types',
  sequencesGroup: 'Sequences',
  columnsGroup: 'Columns',
  indexesGroup: 'Indexes',
  constraintsGroup: 'Constraints',
  triggersGroup: 'Triggers',
  extensionsGroup: 'Extensions',
  table: 'Table',
  partitionedTable: 'Partitioned table',
  foreignTable: 'Foreign table',
  view: 'View',
  matview: 'Materialized view',
  column: 'Column',
  index: 'Index',
  constraint: 'Constraint',
  trigger: 'Trigger',
  function: 'Function',
  procedure: 'Procedure',
  sequence: 'Sequence',
  type: 'Type',
  extension: 'Extension'
};

/** True for the kinds that hold other kinds (a schema or one of its object groups). */
export function isFolderKind(kind: IconKind): boolean {
  return kind === 'schema' || kind.endsWith('Group');
}

export function iconFor(kind: IconKind, opts: IconOptions = {}): LucideIcon {
  if (kind === 'column' && opts.pk) return KeyRound;
  return ICONS[kind];
}

export function iconColorFor(kind: IconKind, opts: IconOptions = {}): string {
  if (kind === 'column' && opts.pk) return 'text-icon-key';
  return COLORS[kind];
}

/** The document icon and its colour, for tabs and chips that show a row rather than an object. */
export const DOCUMENT_ICON: LucideIcon = Braces;
export const DOCUMENT_COLOR = 'text-icon-table';
