import { ArrowDownIcon, ArrowUpIcon, CaretSortIcon, EyeNoneIcon } from '@radix-ui/react-icons';
import { Column } from '@tanstack/react-table';

import { Button } from '@cloudhub-ux/shadcn/src/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@cloudhub-ux/shadcn/src/components/ui/dropdown-menu';
import { cn } from '@cloudhub-ux/shadcn/src/lib/utils';

interface DataTableColumnHeaderProps<TData, TValue> extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title: string;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return (
      <div
        className={cn('font-semibold text-md light:text-black dark:text-white', className)}
        style={{ width: column.getSize() }}
      >
        {title}
      </div>
    );
  }

  return (
    <div
      className={cn('flex items-center space-x-2', className)}
      style={{ width: column.getSize() }}
    >
      <Button
        onClick={() => {
          column.toggleSorting();
        }}
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 data-[state=open]:bg-accent"
      >
        <span className="font-semibold text-md light:text-black dark:text-white">{title}</span>
        {column.getIsSorted() === 'desc' ? (
          <ArrowDownIcon className="ml-2 size-4" />
        ) : column.getIsSorted() === 'asc' ? (
          <ArrowUpIcon className="ml-2 size-4" />
        ) : (
          <CaretSortIcon className="ml-2 size-4" />
        )}
      </Button>
    </div>
  );
}
