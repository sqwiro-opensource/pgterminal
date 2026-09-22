import { describe, expect, it } from 'vitest';
import {
  decodeNodeId,
  encodeNodeId,
  nodeIdMatches,
  nodeIds,
  parentNodeId
} from '@shared/catalog/nodeId';

describe('nodeId codec', () => {
  const awkward = ['plain', 'with/slash', 'dotted.name', 'has space', 'ünïcødé 名前', 'q"uote', '%25', ''];

  it('round-trips awkward names in every segment', () => {
    for (const db of awkward) {
      for (const name of awkward) {
        const id = encodeNodeId('table', [db, 'sales', name]);
        expect(id.split('/')).toHaveLength(4);
        expect(decodeNodeId(id)).toEqual({ kind: 'table', path: [db, 'sales', name] });
      }
    }
  });

  it('rejects unknown kinds', () => {
    expect(() => decodeNodeId('bogus/x')).toThrow(/invalid node id/);
    expect(() => decodeNodeId('')).toThrow();
  });

  it('walks the parent chain from a column up to the database', () => {
    const col = nodeIds.relChild('column', 'sqwiro', 'sales', 'table', 'sales_customer', '_id');
    const chain: string[] = [];
    let cur: string | null = col;
    while (cur) {
      chain.push(cur);
      cur = parentNodeId(cur);
    }
    expect(chain).toEqual([
      'column/sqwiro/sales/table/sales_customer/_id',
      'columnsGroup/sqwiro/sales/table/sales_customer',
      'table/sqwiro/sales/sales_customer',
      'tablesGroup/sqwiro/sales',
      'schema/sqwiro/sales',
      'database/sqwiro'
    ]);
  });

  it('routes views, matviews, routines, sequences, types and extensions to the right folders', () => {
    expect(parentNodeId(nodeIds.relation('view', 'd', 's', 'v'))).toBe('viewsGroup/d/s');
    expect(parentNodeId(nodeIds.relation('matview', 'd', 's', 'v'))).toBe('viewsGroup/d/s');
    expect(parentNodeId(nodeIds.relation('foreignTable', 'd', 's', 'v'))).toBe('tablesGroup/d/s');
    expect(parentNodeId(nodeIds.routine('function', 'd', 's', 'f', 'integer, text'))).toBe('functionsGroup/d/s');
    expect(parentNodeId(nodeIds.sequence('d', 's', 'q'))).toBe('sequencesGroup/d/s');
    expect(parentNodeId(nodeIds.type('d', 's', 't'))).toBe('typesGroup/d/s');
    expect(parentNodeId(nodeIds.extension('d', 'pg_stat_statements'))).toBe('database/d');
    expect(parentNodeId(nodeIds.relGroup('indexesGroup', 'd', 's', 'matview', 'm'))).toBe('matview/d/s/m');
    expect(parentNodeId(nodeIds.database('d'))).toBeNull();
  });

  it('returns null for malformed relation-scoped ids', () => {
    expect(parentNodeId('columnsGroup/d/s/notakind/t')).toBeNull();
    expect(parentNodeId('column/d/s/table')).toBeNull();
  });

  it('matches prefixes segment-wise', () => {
    expect(nodeIdMatches('schema/d/s', 'schema/d/s')).toBe(true);
    expect(nodeIdMatches('schema/d/s', 'table/d/s/x')).toBe(false);
    expect(nodeIdMatches('database/d', 'database/d/anything')).toBe(true);
    expect(nodeIdMatches('database/d', 'database/dd')).toBe(false);
  });
});
