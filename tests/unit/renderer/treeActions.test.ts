import { describe, expect, it, vi } from 'vitest';
import { menuFor, type TreeActionApi } from '../../../src/renderer/src/features/tree/contextMenus';
import type { TreeRow } from '../../../src/renderer/src/features/tree/treeModel';
import { deleteSql, dropSql, insertSql, selectSql, truncateSql, updateSql } from '../../../src/renderer/src/features/tree/sqlTemplates';
import type { ColumnInfo } from '../../../src/shared/types/catalog';
import type { ConnectionMeta } from '../../../src/shared/types/connection';

function fakeActions(): TreeActionApi {
  const api = {} as Record<string, unknown>;
  for (const k of [
    'connect', 'disconnect', 'refreshDatabases', 'setReadOnly', 'editConnection', 'duplicateConnection', 'copyUri', 'deleteConnection',
    'newConnectionInGroup', 'renameGroup', 'connectAll', 'disconnectAll', 'collapse', 'openDatabase', 'closeDatabase', 'refreshNode', 'copyName',
    'copyQualifiedName', 'copyChildNames', 'openData', 'openStructure', 'openOverview', 'newQuery', 'refreshMatview', 'ddlPreview',
    'generate', 'createTemplate', 'editView', 'editFunction', 'selectFromFunction', 'confirmDrop', 'confirmTruncate', 'confirmRename',
    'confirmRestartSequence'
  ]) api[k] = vi.fn();
  return api as unknown as TreeActionApi;
}

const meta = (over: Partial<ConnectionMeta> = {}): ConnectionMeta => ({
  id: 'c1', name: 'srv', host: 'h', port: 5432, user: 'u', defaultDatabase: 'db', sslMode: 'disable', env: 'dev', readOnly: false,
  poolMax: 4, idleTimeoutMs: 30000, statementTimeoutMs: 0, connectTimeoutMs: 5000, hasPassword: true, createdAt: 0, updatedAt: 0, ...over
});

const row = (kind: TreeRow['kind'], over: Partial<TreeRow> = {}): TreeRow => ({
  key: `c1:${kind}/db/s/x`, depth: 1, kind, label: 'x', connectionId: 'c1', database: 'db', nodeId: `${kind}/db/s/x`,
  expanded: false, hasChildren: false, loading: false, parent: -1, ...over
});

const labels = (m: ReturnType<typeof menuFor>) => m.map((e) => e.label);

describe('menuFor', () => {
  it('server menus differ by connection state and every item has a handler or a reason', () => {
    const a = fakeActions();
    const off = menuFor(row('server'), { actions: a, meta: meta(), connState: 'idle' });
    expect(labels(off)).toEqual(['Connect', 'Edit connection…', 'Duplicate', 'Copy URI (no password)', 'Delete']);
    const on = menuFor(row('server'), { actions: a, meta: meta(), connState: 'connected' });
    expect(labels(on)).toEqual(['Open overview', 'New query', 'Disconnect', 'Refresh databases', 'Set read-only', 'Edit connection…', 'Duplicate', 'Copy URI (no password)', 'Delete']);
    for (const e of [...off, ...on]) expect(Boolean(e.onSelect) || (e.disabled && e.reason)).toBeTruthy();
    on.find((e) => e.label === 'Disconnect')?.onSelect?.();
    expect(a.disconnect).toHaveBeenCalledWith('c1');
  });

  it('group menu renames a real group and explains why Ungrouped cannot be renamed', () => {
    const a = fakeActions();
    const named = menuFor(row('group', { label: 'Fleet' }), { actions: a });
    expect(labels(named)).toEqual(['New connection here', 'Rename group…', 'Connect all', 'Disconnect all', 'Collapse']);
    named.find((e) => e.label === 'Rename group…')?.onSelect?.();
    expect(a.renameGroup).toHaveBeenCalledWith('Fleet');

    const ungrouped = menuFor(row('group', { label: 'Ungrouped' }), { actions: a });
    const rename = ungrouped.find((e) => e.label === 'Rename group…');
    expect(rename?.disabled).toBe(true);
    expect(rename?.reason).toBe('Not a group');
    expect(a.renameGroup).toHaveBeenCalledTimes(1);
  });

  it('table menu follows the spec order and Generate SQL is a submenu', () => {
    const a = fakeActions();
    const m = menuFor(row('table'), { actions: a, meta: meta(), connState: 'connected' });
    expect(labels(m)).toEqual([
      'Open data', 'Open structure', 'Open document by id…', 'New query with SELECT', 'Generate SQL', 'Copy name', 'Copy qualified name',
      'Export data…', 'Import from CSV…', 'Rename…', 'Truncate', 'Drop', 'Refresh', 'Properties'
    ]);
    const gen = m.find((e) => e.label === 'Generate SQL');
    expect(gen?.children?.map((c) => c.label)).toEqual(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE']);
    gen?.children?.[1]?.onSelect?.();
    expect(a.generate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'table' }), 'insert');
    m.find((e) => e.label === 'Drop')?.onSelect?.();
    expect(a.confirmDrop).toHaveBeenCalled();
    expect(m.find((e) => e.label === 'Open document by id…')).toMatchObject({ disabled: true, reason: 'Phase 4' });
  });

  it('write actions are disabled with a reason on read-only or disconnected connections', () => {
    const a = fakeActions();
    const ro = menuFor(row('table'), { actions: a, meta: meta({ readOnly: true }), connState: 'connected' });
    for (const l of ['Rename…', 'Truncate', 'Drop']) expect(ro.find((e) => e.label === l)).toMatchObject({ disabled: true, reason: 'Read-only connection' });
    const off = menuFor(row('schema'), { actions: a, meta: meta(), connState: 'idle' });
    expect(off.find((e) => e.label === 'Create table…')).toMatchObject({ disabled: true, reason: 'Connect first' });
  });

  it('covers every level with a non-empty menu', () => {
    const a = fakeActions();
    const kinds: TreeRow['kind'][] = ['group', 'database', 'schema', 'tablesGroup', 'viewsGroup', 'functionsGroup', 'sequencesGroup', 'typesGroup', 'extensionsGroup',
      'columnsGroup', 'view', 'matview', 'function', 'sequence', 'type', 'extension', 'column', 'index', 'constraint', 'trigger'];
    for (const k of kinds) expect(menuFor(row(k, { isOpen: true }), { actions: a, meta: meta(), connState: 'connected' }).length, k).toBeGreaterThan(0);
    expect(labels(menuFor(row('database', { isOpen: false }), { actions: a, meta: meta(), connState: 'connected' }))).toEqual(['Open', 'New query', 'Create database…', 'Drop database', 'Properties']);
    expect(labels(menuFor(row('matview'), { actions: a, meta: meta(), connState: 'connected' }))).toContain('Refresh data');
    expect(menuFor(row('more'), { actions: a })).toEqual([]);
  });
});

describe('sql templates', () => {
  const col = (name: string, over: Partial<ColumnInfo> = {}): ColumnInfo => ({
    name, ordinal: 1, dataType: 'text', nullable: true, default: null, generated: null, identity: null, isPk: false, isFk: false, isUnique: false, comment: null, ...over
  });
  const rel = { schema: 'sales', name: 'sales_customer' };
  const cols = [col('id', { isPk: true, identity: 'always' }), col('_id', { generated: 'stored' }), col('name'), col('Select'), col('a"b')];

  it('SELECT quotes identifiers as needed', () => {
    expect(selectSql(rel, cols)).toBe('SELECT id, _id, name, "Select", "a""b"\nFROM sales.sales_customer\nLIMIT 100;');
  });
  it('INSERT skips generated/identity-always columns and numbers params', () => {
    expect(insertSql(rel, cols)).toBe('INSERT INTO sales.sales_customer (name, "Select", "a""b")\nVALUES ($1, $2, $3)\nRETURNING *;');
  });
  it('UPDATE/DELETE target the primary key', () => {
    expect(updateSql(rel, cols)).toBe('UPDATE sales.sales_customer\nSET name = $1,\n    "Select" = $2,\n    "a""b" = $3\nWHERE id = $4\nRETURNING *;');
    expect(deleteSql(rel, cols)).toBe('DELETE FROM sales.sales_customer\nWHERE id = $1;');
    expect(deleteSql(rel, [col('x')])).toContain('no primary key');
  });
  it('destructive statements honour options', () => {
    expect(dropSql('table', 'sales.sales_customer', { ifExists: true, cascade: true })).toBe('DROP TABLE IF EXISTS sales.sales_customer CASCADE;');
    expect(dropSql('matview', 'a.b')).toBe('DROP MATERIALIZED VIEW a.b;');
    expect(truncateSql(rel, { restartIdentity: true })).toBe('TRUNCATE TABLE sales.sales_customer RESTART IDENTITY;');
  });
});
