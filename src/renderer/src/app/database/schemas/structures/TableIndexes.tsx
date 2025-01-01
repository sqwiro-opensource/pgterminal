import React from 'react';
import { Block } from '@cloudhub-ux/mui';
import { DataTable } from '@src/renderer/app/components/results/datatable/components/data-table';

function TableIndexes({
  indexes,
  tabId,
  schema,
  tableName
}: {
  indexes: any;
  tabId: string;
  schema: string;
  tableName: string;
}) {
  return (
    <Block>
      <DataTable
        data={Object.values(indexes || {})}
        tabId={tabId}
        allowFiltering={false}
        schema={schema}
        tableName={tableName}
      />
    </Block>
  );
}

export default TableIndexes;
