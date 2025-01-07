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

const Row_IdCell = ({ value, row }: { value: string; row: FileData }) => {
  const { openDocumentTab } = useTabInterfaceContext();

  console.log(value);

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
              pk: '_id',
              value: `${value}`,
              document: row || {}
            });
          }}
        >
          <span>{value}</span>
        </Button>
      );
    }
  }

  return <span>{value}</span>;
};

export const useDataTableColumns = ({
  sampleRow,
  onEdit = () => {}
}: {
  sampleRow: FileData;
  onEdit: (row?: any) => void;
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
          {dataColumn.name === '_id' ? (
            <div style={{ width: column.getSize() }}>
              <Row_IdCell value={row.getValue(dataColumn.name)} row={row.original} />
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

      cell: ({ row }) => <DataTableRowActions row={row} onEdit={onEdit} />
    }
  ];

  return {
    columns,
    expandedRows
  };
};
