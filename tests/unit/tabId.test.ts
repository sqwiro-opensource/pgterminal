import { describe, expect, it } from 'vitest';
import type { TabParamsByKind } from '../../src/shared/types/workspace';
import { defaultTitle, tabConnectionId, tabId } from '../../src/shared/workspace/tabId';

const doc = (keyValue: string): TabParamsByKind['document'] => ({
  connectionId: 'c1',
  database: 'sqwiro',
  history: [{ schema: 'sales', table: 'sales_customer', keyColumn: '_id', keyValue, rank: 1, reason: 'prefixedName' }],
  index: 0,
  view: 'tree'
});

describe('tabId', () => {
  it('is deterministic per object', () => {
    const p: TabParamsByKind['table-data'] = { connectionId: 'c1', database: 'db', schema: 'sales', table: 'sales_customer', filters: [], sort: [], page: { mode: 'offset', offset: 0 } };
    expect(tabId('table-data', p)).toBe('table-data:c1/db/sales/sales_customer');
    expect(tabId('table-data', { ...p, filters: [{ column: 'id', op: 'eq', value: 1 }] })).toBe(tabId('table-data', p));
    expect(tabId('table-structure', { connectionId: 'c1', database: 'db', schema: 'sales', table: 'sales_customer', section: 'columns' })).toBe(
      'table-structure:c1/db/sales/sales_customer'
    );
  });

  it('includes the document key so two rows get two tabs', () => {
    expect(tabId('document', doc('42'))).toBe('document:c1/sqwiro/sales/sales_customer/42');
    expect(tabId('document', doc('43'))).not.toBe(tabId('document', doc('42')));
    expect(tabId('document', doc('a/b c'))).toContain(encodeURIComponent('a/b c'));
    expect(tabId('document', { ...doc('x'), history: [], index: 0 })).toBe('document:c1/sqwiro///new');
  });

  it('covers every kind', () => {
    expect(tabId('query', { connectionId: 'c1', database: 'db', sessionId: 's1', sql: '' })).toBe('query:s1');
    expect(tabId('server-overview', { connectionId: 'all' })).toBe('server-overview:all');
    expect(tabId('ddl-preview', { connectionId: 'c1', database: 'db', ddl: { connectionId: 'c1', database: 'db', kind: 'table', schema: 'sales', name: 't' } })).toBe(
      'ddl-preview:c1/db/table/sales/t'
    );
    expect(tabId('function', { connectionId: 'c1', database: 'db', schema: 'public', name: 'f', args: 'integer' })).toBe('function:c1/db/public/f/integer');
    expect(tabId('connections', {})).toBe('connections');
    expect(tabId('settings', {})).toBe('settings');
  });

  it('defaultTitle and tabConnectionId', () => {
    expect(defaultTitle('document', doc('42'))).toBe('sales_customer/42');
    expect(defaultTitle('query', { connectionId: 'c1', database: 'db', sessionId: 's', sql: '' })).toBe('Query');
    expect(defaultTitle('server-overview', { connectionId: 'all' })).toBe('Fleet');
    expect(tabConnectionId({ kind: 'document', params: doc('1') })).toBe('c1');
    expect(tabConnectionId({ kind: 'server-overview', params: { connectionId: 'all' } })).toBeNull();
    expect(tabConnectionId({ kind: 'connections', params: {} })).toBeNull();
  });
});
