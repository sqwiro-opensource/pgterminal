import React from 'react';
import { Block } from '@cloudhub-ux/mui';
import { DataTable } from '@src/renderer/app/components/results/datatable/components/data-table';

function TableRelations({
  relations,
  tabId,
  schema,
  tableName
}: {
  relations: any;
  tabId: string;
  schema: string;
  tableName: string;
}) {
  return (
    <Block>
      <DataTable
        data={Object.values(relations || {})}
        tabId={tabId}
        allowFiltering={false}
        schema={schema}
        tableName={tableName}
      />
    </Block>
  );
}

export default TableRelations;
