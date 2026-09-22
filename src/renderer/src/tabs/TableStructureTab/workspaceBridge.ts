import { useStore } from '@renderer/store';
import type { PageSpec } from '@shared/types/rows';

/** Workspace actions (openTab / updateParams) from the root store, read outside React. */
export function workspace(): Pick<ReturnType<typeof useStore.getState>, 'openTab' | 'updateParams'> {
  return useStore.getState();
}

/** First page of a table-data tab. */
export const FIRST_PAGE: PageSpec = { mode: 'keyset', after: null };

export function openStructure(connectionId: string, database: string, schema: string, table: string): void {
  workspace().openTab('table-structure', { connectionId, database, schema, table, section: 'columns' }, { reuse: true });
}

export function openData(connectionId: string, database: string, schema: string, table: string): void {
  workspace().openTab('table-data', { connectionId, database, schema, table, filters: [], sort: [], page: FIRST_PAGE }, { reuse: true });
}
