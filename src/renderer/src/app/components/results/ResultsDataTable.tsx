import React from 'react';
import { Block, Text } from '@cloudhub-ux/mui';
import { DataTable } from './datatable/components/data-table';
import useTabInterfaceContext from '@src/renderer/context/useTabInterfaceContext';
import EmptySpace from '@src/renderer/app/mainpage/EmptySpace';
import { getTableColumnsSqlScript } from '../../mainpage/scripts/scriptGenerator';
import useSelectedDatabaseContext from '../../database/context/useSelectedDatabaseContext';
import EditColumnButton from './datatable/table/EditColumnButton';
import AddColumnButton from './datatable/table/AddColumnButton';

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
      const tableColulmsSql = getTableColumnsSqlScript(schema, tableName);

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
      <EditColumnButton
        editingRow={editingRow}
        tableStructure={tableStructure}
        schema={schema}
        tableName={tableName}
      />
      <DataTable
        samplerow={samplerow}
        onEdit={setEditingRow}
        editRowComponent={
          <AddColumnButton editingRow={samplerow} schema={schema} tableName={tableName} />
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
