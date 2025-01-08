import React from 'react';
import { Block, Text } from '@cloudhub-ux/mui';
import { DataTable } from './datatable/components/data-table';
import useTabInterfaceContext from '@src/renderer/context/useTabInterfaceContext';
import EmptySpace from '@src/renderer/app/mainpage/EmptySpace';
import { getTableColumnsSqlScript } from '../../mainpage/scripts/scriptGenerator';
import useSelectedDatabaseContext from '../../database/context/useSelectedDatabaseContext';
import AddColumnButton from './datatable/table/AddRowButton';
import QueryComponent from '../editor/QueryComponent';

function ResultsDataTable({
  tabId,
  schema,
  tableName,
  onRowAdded = () => {}
}: {
  tabId: string;
  schema: string;
  tableName?: string;
  onRowAdded?: (row: any) => void;
}) {
  const { tabs, openNewTab } = useTabInterfaceContext();
  const { dbQuery } = useSelectedDatabaseContext();

  const { data } = (tabs[tabId] || {}).resultsState || {};

  const [samplerow, setSampleRow] = React.useState<any>(null);
  const [tableStructure, setTableStructure] = React.useState<{
    [key: string]: {
      name: string;
      type: string;
      defaultValue: string;
      isNullable: boolean;
      isPrimaryKey: boolean;
    };
  }>({});

  const [editingRow, setEditingRow] = React.useState<any>(null);

  React.useEffect(() => {
    const getTableColumns = async () => {
      const tableColulmsSql = getTableColumnsSqlScript(schema, tableName as string);

      const { data } = await dbQuery(tableColulmsSql);

      if (data && Array.isArray(data)) {
        const sampleRow = data.reduce((acc, curr) => {
          acc[curr.column_name] = ['numeric', 'integer', 'bigint', 'smallint', 'decimal'].includes(
            curr.data_type
          )
            ? 0
            : '';
          return acc;
        }, {});

        const tableStructure = data.reduce((acc, curr) => {
          acc[curr.column_name] = {
            name: curr.column_name,
            type: curr.data_type,
            defaultValue: sampleRow[curr.column_name],
            isNullable: curr.is_nullable === 'YES',
            isPrimaryKey: curr.is_primary_key
          };
          return acc;
        }, {});

        setTableStructure(tableStructure);

        setSampleRow(sampleRow);
      }
    };

    if (tableName && schema) {
      getTableColumns();
    }
  }, [tableName, schema]);

  if (!data) {
    return (
      <Block center middle>
        <EmptySpace />
      </Block>
    );
  }

  return (
    <Block>
      <DataTable
        samplerow={samplerow}
        onDelete={async ({ row, pk }: { row: any; pk: string }) => {
          openNewTab({
            id: `drop/${schema}_${row[pk]}`,
            title: `Drop SQL: ${schema}.${row[pk]}`,
            type: 'query',
            queryState: {
              query: `
              DELETE FROM ${schema}."${tableName}"
              WHERE ${pk} = '${row[pk]}'`
            },
            resultsState: {
              data: []
            },
            queryComponent: <QueryComponent tabId={`drop/${schema}_${row[pk]}`} />,
            resultsComponent: null
          });
        }}
        tableStructure={tableStructure}
        editRowComponent={
          <AddColumnButton
            editingRow={samplerow}
            schema={schema}
            tableName={tableName}
            onRowAdded={onRowAdded}
          />
        }
        data={data}
        tabId={tabId}
        schema={schema}
        tableName={tableName}
      />
    </Block>
  );
}

export default ResultsDataTable;
