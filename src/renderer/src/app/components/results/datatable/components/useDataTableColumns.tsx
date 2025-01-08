'use client';

import { ColumnDef } from '@tanstack/react-table';

import { Badge } from '@cloudhub-ux/shadcn/src/components/ui/badge';
import { Checkbox } from '@cloudhub-ux/shadcn/src/components/ui/checkbox';
import { DataTableColumnHeader } from './data-table-column-header';
import { DataTableRowActions } from './data-table-row-actions';
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button';
import { MdiChevronDown, MdiChevronRight } from '@cloudhub-ux-icons/mdi';
import React from 'react';
import useTabInterfaceContext from '@src/renderer/context/useTabInterfaceContext';
import { toastr } from '@cloudhub-ux/mui';

type FileData = {
  createdAt: number;
  updatedAt: number;
  id: string;
  _id: string;
  name: string;
  type: string;
  tags: string[];
  favorited: string;
};

const TableCell = ({ children }: { children: React.ReactNode }) => {
  // only one line and no overflow just ellipsis
  return <div className="flex items-center truncate">{children}</div>;
};

const Row_IdCell = ({
  value,
  row,
  schema,
  tableName,
  pk
}: {
  value: string;
  row: FileData;
  schema: string;
  tableName: string;
  pk: string;
}) => {
  const { openDocumentTab } = useTabInterfaceContext();

  if (`${value}`.includes('/')) {
    const [tableName, document_id] = `${value}`.split('/');

    if (`${tableName}`.includes('_')) {
      const [schema, schema_tableName] = tableName.split('_');

      return (
        <Button
          variant="link"
          className="p-0 m-0"
          onClick={() => {
            openDocumentTab({
              schema,
              tableName,
              pk,
              value: `${value}`,
              document: row || {}
            });
          }}
        >
          <span>{value}</span>
        </Button>
      );
    }
  } else if (tableName && schema) {
    return (
      <Button
        variant="link"
        className="p-0 m-0"
        onClick={() => {
          openDocumentTab({
            schema,
            tableName,
            pk,
            value: `${value}`,
            document: row || {}
          });
        }}
      >
        <span>{value}</span>
      </Button>
    );
  }

  return <span>{value}</span>;
};

export const useDataTableColumns = ({
  sampleRow,
  onDelete = () => {},
  tableStructure,
  schema,
  tableName
}: {
  sampleRow: FileData;
  onDelete: (params: { row: FileData; pk: string }) => void;
  tableStructure?: {
    [key: string]: {
      name: string;
      type: string;
      defaultValue: string;
      isNullable: boolean;
      isPrimaryKey: boolean;
    };
  };
  schema: string;
  tableName: string;
}) => {
  const columnNames = Object.keys(sampleRow || {}).map((key) => ({
    name: key,
    isJsonBDataType:
      typeof sampleRow[key as keyof typeof sampleRow] === 'object' ||
      Array.isArray(sampleRow[key as keyof typeof sampleRow])
  }));

  const [expandedRows, setExpandedRows] = React.useState<Record<string, boolean>>({});

  const toggleRow = (rowId: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [rowId]: !prev[rowId]
    }));
  };

  const pkColumn = Object.keys(tableStructure || {}).find(
    (key) => (tableStructure || {})[key].isPrimaryKey
  );

  console.log('====================================');
  console.log(pkColumn);
  console.log('====================================');

  const columns: ColumnDef<FileData>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          className="translate-y-[2px]"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          className="translate-y-[2px]"
        />
      ),
      enableSorting: false,
      enableHiding: false
    },

    {
      id: 'expander',
      header: '',
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" className="p-0 h-8 w-8" onClick={() => toggleRow(row.id)}>
          {expandedRows[row.id] ? (
            <MdiChevronDown className="h-4 w-4" />
          ) : (
            <MdiChevronRight className="h-4 w-4" />
          )}
        </Button>
      ),
      size: 40
    },

    {
      id: 'index',
      header: '#',
      cell: ({ row }) => <div>{row.index + 1}</div>
    },

    ...columnNames.map((dataColumn) => ({
      accessorKey: dataColumn.name,
      header: ({ column }) => {
        return (
          <DataTableColumnHeader
            column={column}
            title={column.id}
            className="font-semibold text-md light:text-black dark:text-white"
          />
        );
      },
      cell: ({ row, column }) => (
        <TableCell style={{ width: column.getSize() }} className="w-96 truncate">
          {tableStructure &&
          tableStructure[dataColumn.name] &&
          tableStructure[dataColumn.name].isPrimaryKey ? (
            <div style={{ width: column.getSize() }}>
              <Row_IdCell
                schema={schema}
                tableName={tableName}
                value={row.getValue(dataColumn.name)}
                row={row.original}
                pk={dataColumn.name}
              />
            </div>
          ) : (
            <div style={{ width: column.getSize() }}>
              {['string', 'number'].includes(typeof row.getValue(dataColumn.name))
                ? row.getValue(dataColumn.name)
                : JSON.stringify(row.getValue(dataColumn.name))}
            </div>
          )}
        </TableCell>
      ),
      enableSorting: dataColumn.isJsonBDataType === false,
      enableHiding: true
    })),

    {
      id: 'actions',

      cell: ({ row }) => (
        <DataTableRowActions
          row={row}
          onDelete={() => {
            if (!pkColumn) {
              toastr.error('No primary key found');
              return;
            } else {
              onDelete({
                row: row.original,
                pk: pkColumn
              });
            }
          }}
        />
      )
    }
  ];

  return {
    columns,
    expandedRows
  };
};
