import { describe, expect, it } from 'vitest';
import { flattenTree, formatBytes, formatCount, type TreeState } from '../../../src/renderer/src/features/tree/treeModel';
import { nodeIds } from '../../../src/shared/catalog/nodeId';
import type { ConnectionMeta } from '../../../src/shared/types/connection';
import type { DatabaseNode, RelationNode, SchemaNode } from '../../../src/shared/types/catalog';
import type { NodeKey } from '../../../src/renderer/src/store/catalog.slice';

function meta(id: string, name: string, group?: string, extra: Partial<ConnectionMeta> = {}): ConnectionMeta {
  return {
    id, name, host: 'h', port: 5432, user: 'u', defaultDatabase: 'postgres', sslMode: 'disable', env: 'prod',
    group, readOnly: false, poolMax: 4, idleTimeoutMs: 30000, statementTimeoutMs: 0, connectTimeoutMs: 5000,
    hasPassword: true, createdAt: 0, updatedAt: 0, ...extra
  };
}
const k = (c: string, n: string): NodeKey => `${c}:${n}`;

function fixture(): TreeState {
  const schemaSales: SchemaNode = {
    id: nodeIds.schema('sqwiro', 'sales'), kind: 'schema', name: 'sales', parentId: nodeIds.database('sqwiro'),
    hasChildren: true, owner: 'pgterminal', comment: null,
    children: [
      { id: nodeIds.group('tablesGroup', 'sqwiro', 'sales'), kind: 'tablesGroup', name: 'Tables', parentId: null, hasChildren: true, count: 2 },
      { id: nodeIds.group('viewsGroup', 'sqwiro', 'sales'), kind: 'viewsGroup', name: 'Views', parentId: null, hasChildren: true, count: 1 },
      { id: nodeIds.group('functionsGroup', 'sqwiro', 'sales'), kind: 'functionsGroup', name: 'Functions', parentId: null, hasChildren: false, count: 0 }
    ]
  };
  const schemaPublic: SchemaNode = { id: nodeIds.schema('sqwiro', 'public'), kind: 'schema', name: 'public', parentId: null, hasChildren: true, owner: 'pgterminal', comment: null };
  const db: DatabaseNode = {
    id: nodeIds.database('sqwiro'), kind: 'database', name: 'sqwiro', parentId: null, hasChildren: true,
    schemas: [schemaPublic, schemaSales], searchPath: ['public'],
    server: { version: '16', versionNum: 160000, serverEncoding: 'UTF8', isSuperuser: false, extensions: [] },
    children: [{ id: nodeIds.extension('sqwiro', 'plpgsql'), kind: 'extension', name: 'plpgsql', parentId: null, hasChildren: false }]
  };
  const tables = {
    id: nodeIds.group('tablesGroup', 'sqwiro', 'sales'), kind: 'tablesGroup' as const, name: 'Tables', parentId: null, hasChildren: true, count: 2,
    children: [
      { id: nodeIds.relation('table', 'sqwiro', 'sales', 'sales_customer'), kind: 'table' as const, name: 'sales_customer', parentId: null, hasChildren: true, estimatedRows: '1203441', sizeBytes: '13000000000' },
      { id: nodeIds.relation('table', 'sqwiro', 'sales', 'sales_order'), kind: 'table' as const, name: 'sales_order', parentId: null, hasChildren: true, estimatedRows: '98000' }
    ]
  };
  const rel: RelationNode = {
    id: nodeIds.relation('table', 'sqwiro', 'sales', 'sales_customer'), kind: 'table', name: 'sales_customer', parentId: null, hasChildren: true,
    schema: 'sales', estimatedRows: '1203441', sizeBytes: '13000000000', comment: null,
    columns: [
      { name: 'id', ordinal: 1, dataType: 'integer', nullable: false, default: null, generated: null, identity: 'always', isPk: true, isFk: false, isUnique: false, comment: null },
      { name: 'name', ordinal: 2, dataType: 'text', nullable: true, default: null, generated: null, identity: null, isPk: false, isFk: false, isUnique: false, comment: null }
    ],
    indexes: [{ name: 'sales_customer_pkey', definition: '', isUnique: true, isPrimary: true, method: 'btree', columns: ['id'], sizeBytes: '8192' }],
    constraints: [{ name: 'sales_customer_pkey', type: 'p', definition: '', columns: ['id'] }],
    triggers: []
  };
  return {
    connections: { c1: meta('c1', 'adminserver', 'Production'), c2: meta('c2', 'tradingserver', undefined, { readOnly: true }) },
    status: {
      c1: {
        state: 'connected', openDatabases: ['sqwiro'],
        databases: [
          { name: 'sqwiro', owner: 'pgterminal', encoding: 'UTF8', sizeBytes: '13314398618', isTemplate: false, allowConn: true },
          { name: 'analytics', owner: 'pgterminal', encoding: 'UTF8', sizeBytes: null, isTemplate: false, allowConn: true },
          { name: 'template0', owner: 'pgterminal', encoding: 'UTF8', sizeBytes: null, isTemplate: true, allowConn: false }
        ]
      },
      c2: { state: 'idle', openDatabases: [] }
    },
    nodes: {
      [k('c1', db.id)]: db,
      [k('c1', schemaSales.id)]: schemaSales,
      [k('c1', tables.id)]: tables,
      [k('c1', rel.id)]: rel
    },
    loading: {}, errors: {},
    expanded: {
      [k('c1', schemaSales.id)]: true,
      [k('c1', tables.id)]: true,
      [k('c1', rel.id)]: true,
      [k('c1', nodeIds.relGroup('columnsGroup', 'sqwiro', 'sales', 'table', 'sales_customer'))]: true
    },
    activeConnectionId: 'c1'
  };
}

describe('formatting', () => {
  it('formatCount', () => {
    expect(formatCount('42')).toBe('42');
    expect(formatCount('1203441')).toBe('1.2M');
    expect(formatCount(98000)).toBe('98k');
    expect(formatCount('1500')).toBe('1.5k');
    expect(formatCount('-1')).toBe('');
    expect(formatCount(null)).toBe('');
  });
  it('formatBytes', () => {
    expect(formatBytes('13314398618')).toBe('12.4 GB');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes('500')).toBe('500 B');
    expect(formatBytes(null)).toBe('');
  });
});

describe('flattenTree', () => {
  it('orders groups, servers, databases, schemas, folders, objects, sub-folders and leaves with depths', () => {
    const rows = flattenTree(fixture());
    const labels = rows.map((r) => `${r.depth}:${r.kind}:${r.label}`);
    expect(labels.slice(0, 4)).toEqual(['0:group:Production', '1:server:adminserver', '2:database:sqwiro', '3:schema:public']);
    expect(labels).toContain('3:schema:sales');
    expect(labels).toContain('4:tablesGroup:Tables');
    expect(labels).toContain('5:table:sales_customer');
    expect(labels).toContain('6:columnsGroup:Columns');
    expect(labels).toContain('7:column:id');
    expect(labels).toContain('3:extensionsGroup:Extensions');
    // ungrouped group comes last, with the idle read-only server collapsed
    expect(labels.slice(-2)).toEqual(['0:group:Ungrouped', '1:server:tradingserver']);
    const trading = rows[rows.length - 1]!;
    expect(trading.status).toBe('off');
    expect(trading.readOnly).toBe(true);
    expect(trading.hasChildren).toBe(false);
    // template db hidden, unopened db muted
    expect(labels).not.toContain('2:database:template0');
    const analytics = rows.find((r) => r.label === 'analytics')!;
    expect(analytics.isOpen).toBe(false);
    expect(analytics.hasChildren).toBe(false);
  });

  it('formats meta and flags', () => {
    const rows = flattenTree(fixture());
    expect(rows.find((r) => r.label === 'sqwiro')!.meta).toBe('12.4 GB');
    expect(rows.find((r) => r.label === 'sales_customer')!.meta).toBe('1.2M');
    expect(rows.find((r) => r.label === 'sales_order')!.meta).toBe('98k');
    expect(rows.find((r) => r.label === 'Tables')!.meta).toBe('2');
    expect(rows.find((r) => r.label === 'Functions')!.hasChildren).toBe(false);
    const id = rows.find((r) => r.kind === 'column' && r.label === 'id')!;
    expect(id.pk).toBe(true);
    expect(id.meta).toBe('integer');
    expect(rows.find((r) => r.label === 'adminserver')!.isActive).toBe(true);
    expect(rows.find((r) => r.label === 'Indexes')!.expanded).toBe(false);
  });

  it('parent indexes point at the right rows', () => {
    const rows = flattenTree(fixture());
    const col = rows.findIndex((r) => r.kind === 'column' && r.label === 'name');
    const parent = rows[rows[col]!.parent]!;
    expect(parent.kind).toBe('columnsGroup');
    expect(rows[parent.parent]!.label).toBe('sales_customer');
  });

  it('collapses a server that is explicitly collapsed', () => {
    const s = fixture();
    s.expanded['c1:server'] = false;
    const rows = flattenTree(s);
    expect(rows.map((r) => r.label)).not.toContain('sqwiro');
  });

  it('shows a "more databases" row after eight unopened databases', () => {
    const s = fixture();
    s.status.c1!.databases = Array.from({ length: 12 }, (_, i) => ({
      name: `db${i}`, owner: 'x', encoding: 'UTF8', sizeBytes: null, isTemplate: false, allowConn: true
    }));
    s.status.c1!.openDatabases = [];
    const rows = flattenTree(s);
    const dbRows = rows.filter((r) => r.kind === 'database');
    expect(dbRows).toHaveLength(8);
    expect(rows.find((r) => r.kind === 'more')!.label).toBe('… 4 more databases');
    s.expanded['c1:more'] = true;
    expect(flattenTree(s).filter((r) => r.kind === 'database')).toHaveLength(12);
  });

  it('filters to matches plus ancestors and auto-expands loaded nodes', () => {
    const s = fixture();
    s.expanded = {}; // nothing expanded by the user
    const rows = flattenTree(s, 'CUSTOMER');
    const labels = rows.map((r) => r.label);
    expect(labels).toContain('sales_customer');
    expect(labels).toContain('Tables');
    expect(labels).toContain('sales');
    expect(labels).toContain('sqwiro');
    expect(labels).toContain('adminserver');
    expect(labels).not.toContain('sales_order');
    expect(labels).not.toContain('Views');
    expect(labels).not.toContain('tradingserver');
    expect(rows.find((r) => r.label === 'sales_customer')!.matches).toBe(true);
    expect(rows.find((r) => r.label === 'Tables')!.matches).toBe(false);
    // unloaded schema keeps a hint row
    expect(labels).toContain('public');
    expect(rows.find((r) => r.kind === 'hint')!.label).toBe('Load schema to search');
    // parents re-mapped after filtering
    const sc = rows.find((r) => r.label === 'sales_customer')!;
    expect(rows[sc.parent]!.label).toBe('Tables');
  });
});
