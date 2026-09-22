import { AlertCircle } from 'lucide-react';
import type { PgErrorInfo } from '@shared/types/query';
import { GUTTER_WIDTH, type GridColumn } from './gridModel';

export function GridErrorCard({ error }: { error: PgErrorInfo }) {
  return (
    <div className="m-3 flex gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-[12.5px]">
      <AlertCircle size={16} strokeWidth={1.75} className="mt-0.5 flex-none text-destructive" />
      <div className="min-w-0">
        <div className="font-medium">
          {error.code && <span className="mr-2 font-mono text-[11px] text-destructive">{error.code}</span>}
          {error.message}
        </div>
        {error.detail && <div className="mt-1 text-muted-foreground">{error.detail}</div>}
        {error.hint && <div className="mt-1 text-muted-foreground">Hint: {error.hint}</div>}
      </div>
    </div>
  );
}

export function GridSkeleton({ columns, widthOf, rowHeight }: { columns: GridColumn[]; widthOf: (c: GridColumn) => number; rowHeight: number }) {
  const cols = columns.length ? columns : [{ id: 'a', width: 220 }, { id: 'b', width: 160 }, { id: 'c', width: 300 }];
  return (
    <div className="h-full overflow-hidden p-0">
      {Array.from({ length: 10 }).map((_, r) => (
        <div key={r} className="flex items-center gap-px border-b border-grid-line" style={{ height: rowHeight }}>
          <div style={{ width: GUTTER_WIDTH }} />
          {cols.map((c) => (
            <div key={c.id} className="px-2" style={{ width: 'width' in c && 'index' in c ? widthOf(c as GridColumn) : c.width }}>
              <div className="h-3 animate-pulse rounded bg-muted" style={{ width: `${40 + ((r * 37 + c.id.length * 13) % 50)}%` }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
