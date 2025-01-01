'use client';

import SimpleBar from 'simplebar-react';

import * as React from 'react';
import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  VisibilityState
} from '@tanstack/react-table';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@cloudhub-ux/shadcn/src/components/ui/table';
import { DataTablePagination } from './data-table-pagination';
import { DataTableToolbar } from './data-table-toolbar';
import { Block } from '@cloudhub-ux/mui';
import useTabInterfaceContext from '@src/renderer/context/useTabInterfaceContext';
import { useDataTableColumns } from '@src/renderer/app/components/results/datatable/components/useDataTableColumns';
import ExpandedRow from '@src/renderer/app/components/results/datatable/components/ExpandedRow';
import MonacoJsonEditor from '@src/renderer/app/components/editor/MonacoJsonEditor';

interface DataTableProps<TData, TValue> {
  columns?: ColumnDef<TData, TValue>[];
  data: TData[];
  tabId: string;
  allowFiltering?: boolean;
  schema: string;
  tableName?: string;
}

export function DataTable<TData, TValue>({
  data,
  tabId,
  allowFiltering = true,
  schema,
  tableName
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const { columns, expandedRows } = useDataTableColumns({ sampleRow: (data || [])[0] as any });

  const { tabs, dispatch } = useTabInterfaceContext();

  const { resultsState } = tabs[tabId] || {};

  const { pagination, view } = resultsState || {};

  const setPagination = (callback: (PaginationState) => any) => {
    const newPagination = callback(pagination);

    dispatch((state) => ({
      tabInterfaceContext: {
        ...state.tabInterfaceContext,
        tabs: {
          ...state.tabInterfaceContext.tabs,
          [tabId]: {
            ...state.tabInterfaceContext.tabs[tabId],
            resultsState: {
              ...state.tabInterfaceContext.tabs[tabId].resultsState,
              pagination: {
                ...state.tabInterfaceContext.tabs[tabId].resultsState.pagination,
                ...newPagination
              }
            }
          }
        }
      }
    }));
  };

  const table = useReactTable({
    data,
    columns: columns as any,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      pagination
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination as any,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues()
  });

  return (
    <Block className="space-y-2  h-full flex flex-col">
      <Block flex={false}>
        <DataTableToolbar
          table={table}
          view={view}
          allowFiltering={allowFiltering}
          onChangeView={(view) => {
            if (view) {
              dispatch((state) => ({
                tabInterfaceContext: {
                  ...state.tabInterfaceContext,
                  tabs: {
                    ...state.tabInterfaceContext.tabs,
                    [tabId]: {
                      ...state.tabInterfaceContext.tabs[tabId],
                      resultsState: { ...state.tabInterfaceContext.tabs[tabId].resultsState, view }
                    }
                  }
                }
              }));
            }
          }}
        />
      </Block>

      <Block style={{ position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            overflow: 'hidden'
          }}
        >
          <Block
            flex={false}
            // color="yellow"

            sx={{
              height: '100%',
              overflow: 'auto',
              position: 'relative',
              '& > div': {
                overflow: 'hidden',
                position: 'relative',
                flex: 1,
                // overflow: 'auto' on hover
                '&:hover': {
                  overflow: 'auto'
                },

                '&::-webkit-scrollbar': {
                  width: '8px',

                  backgroundColor: 'transparent' // Hide default thumb
                },
                '&::-webkit-scrollbar-track': {
                  background: 'transparent',
                  marginTop: '34px'
                },
                '&::-webkit-scrollbar-thumb': {
                  marginTop: '34px'
                  // backgroundColor: 'transparent' // Hide default thumb
                }
              }
            }}
          >
            {view === 'table' ? (
              <Table className="relative w-full">
                <TableHeader
                  className="sticky top-0 bg-background w-full shadow-md"
                  style={{ height: '32px', zIndex: 1000 }}
                >
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => {
                        return (
                          <TableHead key={header.id} colSpan={header.colSpan} className="h-8 px-2">
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableHeader>

                <TableBody className="overflow-hidden">
                  {table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row) => (
                      <React.Fragment key={row.id}>
                        <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id} className="h-8 py-1 px-2">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </TableRow>
                        {expandedRows[row.id] && (
                          <TableRow>
                            <TableCell colSpan={columns.length} className="px-6 py-4">
                              <ExpandedRow
                                row={row.original}
                                schema={schema}
                                tableName={tableName}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="h-24 text-center">
                        No results.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            ) : (
              <Block flex={false}>
                <MonacoJsonEditor
                  value={JSON.stringify(
                    pagination.pageSize === data.length
                      ? data
                      : table.getRowModel().rows.map((row) => row.original),
                    null,
                    2
                  )}
                  options={{
                    minimap: { enabled: false },
                    readOnly: true
                  }}
                />
              </Block>
            )}
          </Block>
        </div>
      </Block>

      <Block flex={false} marginB>
        {/* {data.length > pagination.pageSize && (
          <DataTablePagination table={table} dataLength={data.length} />
        )} */}
        <DataTablePagination table={table} dataLength={data.length} />
      </Block>
    </Block>
  );
}
