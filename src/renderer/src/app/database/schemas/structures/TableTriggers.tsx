import React from 'react';
import { Block } from '@cloudhub-ux/mui';
import { DataTable } from '@src/renderer/app/components/results/datatable/components/data-table';

function TableTriggers({
  triggers,
  tabId,
  schema,
  tableName
}: {
  triggers: any;
  tabId: string;
  schema: string;
  tableName: string;
}) {
  return (
    <Block>
      <DataTable
        data={Object.values(triggers || {})}
        tabId={tabId}
        allowFiltering={false}
        schema={schema}
        tableName={tableName}
      />
    </Block>
  );
}

export default TableTriggers;
