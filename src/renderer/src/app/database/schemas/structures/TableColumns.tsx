import React from 'react';
import { Block } from '@cloudhub-ux/mui';
import { DataTable } from '@src/renderer/app/components/results/datatable/components/data-table';

function TableColumns({
  columns,
  tabId,
  schema,
  tableName
}: {
  columns: any;
  tabId: string;
  schema: string;
  tableName: string;
}) {
  return (
    <Block>
      <DataTable data={Object.values(columns || {})} tabId={tabId} allowFiltering={false} />
    </Block>
  );
}

export default TableColumns;
