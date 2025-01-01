'use client'

import { ColumnDef } from '@tanstack/react-table'

import { Badge } from '@cloudhub-ux/shadcn/src/components/ui/badge'
import { Checkbox } from '@cloudhub-ux/shadcn/src/components/ui/checkbox'
import { DataTableColumnHeader } from './data-table-column-header'
import { DataTableRowActions } from './data-table-row-actions'
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button'
import { MdiChevronDown, MdiChevronRight } from '@cloudhub-ux-icons/mdi'
import React from 'react'

type FileData = {
  createdAt: number
  updatedAt: number
  id: string
  _id: string
  name: string
  type: string
  tags: string[]
  favorited: string
}

const TableCell = ({ children }: { children: React.ReactNode }) => {
  // only one line and no overflow just ellipsis
  return <div className="flex items-center truncate">{children}</div>
}

export const useDataTableColumns = ({ sampleRow }: { sampleRow: FileData }) => {
  const columnNames = Object.keys(sampleRow || {}).map((key) => ({
    name: key,
    isJsonBDataType:
      typeof sampleRow[key as keyof typeof sampleRow] === 'object' ||
      Array.isArray(sampleRow[key as keyof typeof sampleRow])
  }))

  const [expandedRows, setExpandedRows] = React.useState<Record<string, boolean>>({})

  const toggleRow = (rowId: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [rowId]: !prev[rowId]
    }))
  }

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

    ...columnNames.map((column) => ({
      accessorKey: column.name,
      header: ({ column }) => {
        return (
          <DataTableColumnHeader
            column={column}
            title={column.id}
            className="font-semibold text-md light:text-black dark:text-white"
          />
        )
      },
      cell: ({ row }) => (
        <TableCell>
          {column.isJsonBDataType
            ? JSON.stringify(row.getValue(column.name))
            : row.getValue(column.name)}
        </TableCell>
      ),
      enableSorting: column.isJsonBDataType === false,
      enableHiding: true
    })),

    {
      id: 'actions',

      cell: ({ row }) => <DataTableRowActions row={row} />
    }
  ]

  return {
    columns,
    expandedRows
  }
}
