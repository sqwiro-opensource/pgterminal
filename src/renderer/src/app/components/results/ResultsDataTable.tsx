import React from 'react';
import { Block, Text } from '@cloudhub-ux/mui';
import { DataTable } from './datatable/components/data-table';
import useTabInterfaceContext from '@src/renderer/context/useTabInterfaceContext';
import EmptySpace from '@src/renderer/app/mainpage/EmptySpace';

function ResultsDataTable({
  tabId,
  schema,
  tableName
}: {
  tabId: string;
  schema: string;
  tableName?: string;
}) {
  const { tabs } = useTabInterfaceContext();

  const { data } = (tabs[tabId] || {}).resultsState || {};

  if (!data) {
    return (
      <Block center middle>
        <EmptySpace />
      </Block>
    );
  }

  return (
    <Block>
      <DataTable data={data} tabId={tabId} schema={schema} tableName={tableName} />
    </Block>
  );
}

export default ResultsDataTable;
