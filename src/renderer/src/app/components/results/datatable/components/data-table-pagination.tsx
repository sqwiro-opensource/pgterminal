import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DoubleArrowLeftIcon,
  DoubleArrowRightIcon
} from '@radix-ui/react-icons';
import { Table } from '@tanstack/react-table';

import { Button } from '@cloudhub-ux/shadcn/src/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@cloudhub-ux/shadcn/src/components/ui/select';
import { Block } from '@cloudhub-ux/mui';

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
}

export function DataTablePagination<TData>({
  table,
  dataLength
}: DataTablePaginationProps<TData> & {
  dataLength: number;
}) {
  const sizes = [5, 10, 20, 50, 100, 500, 1000];

  if (!sizes.includes(dataLength)) {
    sizes.push(dataLength);
  }

  return (
    <Block flex={false} row middle className="items-center justify-between px-2 mb-2">
      <Block flex={false} className="text-sm text-muted-foreground">
        {table.getFilteredSelectedRowModel().rows.length} of{' '}
        {table.getFilteredRowModel().rows.length} row(s) selected.
      </Block>
      <Block flex={false} row middle className=" items-center space-x-6 lg:space-x-8">
        <Block flex={false} row middle className="items-center space-x-2">
          <p className="text-sm font-medium">Rows per page</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value));
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {sizes
                .filter((pageSize) => pageSize <= dataLength)
                .map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Block>
        <Block
          flex={false}
          row
          middle
          className="w-[100px] items-center justify-center text-sm font-medium"
        >
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </Block>
        <Block flex={false} row middle className="items-center space-x-2">
          <Button
            variant="outline"
            className="hidden size-8 p-0 lg:flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to first page</span>
            <DoubleArrowLeftIcon className="size-4" />
          </Button>
          <Button
            variant="outline"
            className="size-8 p-0"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button
            variant="outline"
            className="size-8 p-0"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRightIcon className="size-4" />
          </Button>
          <Button
            variant="outline"
            className="hidden size-8 p-0 lg:flex"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to last page</span>
            <DoubleArrowRightIcon className="size-4" />
          </Button>
        </Block>
      </Block>
    </Block>
  );
}
