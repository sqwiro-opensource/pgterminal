'use client';

import { Cross2Icon } from '@radix-ui/react-icons';
import { Table } from '@tanstack/react-table';

import { Button } from '@cloudhub-ux/shadcn/src/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@cloudhub-ux/shadcn/src/components/ui/toggle-group';
import { DataTableViewOptions } from './data-table-view-options';
import FilterForm from '@src/renderer/app/components/results/datatable/components/FilterForm';
import { MdiFilterAlt, MdiJson, MdiTable } from '@cloudhub-ux-icons/mdi';
import { Block, Text } from '@cloudhub-ux/mui';
import React from 'react';

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
}

export function DataTableToolbar<TData>({
  table,
  view = 'table',
  onChangeView,
  allowFiltering = true,
  editRowComponent
}: DataTableToolbarProps<TData> & {
  view: 'json' | 'table';
  onChangeView: (view: 'json' | 'table') => void;
  allowFiltering?: boolean;
  editRowComponent?: React.ReactNode;
}) {
  const [showFilter, setShowFilter] = React.useState(false);
  const isFiltered = table.getState().columnFilters.length > 0;
  const sampleRow = (table.getRowModel().rows[0] || {}).original || {};

  return (
    <Block row top className="px-2 mt-2">
      <Block row flex={false} middle>
        {allowFiltering && (
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 mr-2"
            onClick={() => setShowFilter(!showFilter)}
          >
            <MdiFilterAlt />
          </Button>
        )}
        {editRowComponent}
      </Block>
      <Block className="space-x-2">
        {showFilter && <FilterForm sampleRow={sampleRow as any} />}

        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            className="h-8 px-2 lg:px-3"
          >
            Reset
            <Cross2Icon className="ml-2 size-4" />
          </Button>
        )}
      </Block>

      <Block flex={false} row middle>
        <div className="flex flex-col items-center space-y-4">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(value) => {
              if (value && typeof onChangeView === 'function') {
                onChangeView(value as 'json' | 'table');
              }
            }}
          >
            <ToggleGroupItem
              value="json"
              aria-label="Toggle JSON view"
              className="h-8 flex-1 [&[data-state='on']]:border [&[data-state='on']]:border-primary [&[data-state='on']]:bg-grey-300"
            >
              <MdiJson size={18} className="h-4 w-4 mr-2" />
              JSON
            </ToggleGroupItem>
            <ToggleGroupItem
              value="table"
              aria-label="Toggle Table view"
              className="h-8 flex-1 mr-2 [&[data-state='on']]:border [&[data-state='on']]:border-primary [&[data-state='on']]:bg-grey-300"
            >
              <MdiTable size={18} className="h-4 w-4 mr-2" />
              Table
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <DataTableViewOptions table={table} />
      </Block>
    </Block>
  );
}
