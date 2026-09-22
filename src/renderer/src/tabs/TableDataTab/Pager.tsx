import { ChevronLeft, ChevronRight, ChevronsLeft, RefreshCw } from 'lucide-react';
import type { CountResult, RowsPage } from '@shared/types/rows';
import { IconButton } from '@renderer/components/ui/IconButton';

interface Props {
  page: RowsPage | null;
  pageIndex: number;
  limit: number;
  keyset: boolean;
  count: CountResult | null;
  countLoading: boolean;
  loading: boolean;
  onPrev(): void;
  onNext(): void;
  onFirst(): void;
  onGoTo(pageNo: number): void;
  onPageSize(n: number): void;
  onRefresh(): void;
  onExactCount(): void;
}

const fmt = (n: number | string) => Number(n).toLocaleString();

/** Bottom pager: rows a–b of N (~), page navigation (keyset ‹ › or offset go-to), page size, timing. */
export function Pager(p: Props) {
  const rows = p.page?.rows.length ?? 0;
  const from = rows ? p.pageIndex * p.limit + 1 : 0;
  const to = p.pageIndex * p.limit + rows;
  const total = p.count?.exact ?? p.count?.estimate ?? null;
  const approx = p.count ? p.count.exact === null : true;
  const pages = total !== null && Number(total) > 0 ? Math.max(1, Math.ceil(Number(total) / p.limit)) : null;
  return (
    <div className="flex h-7 flex-none items-center gap-3 border-t border-border px-2 font-mono text-[11.5px] text-muted-foreground">
      <span>
        Rows {fmt(from)}–{fmt(to)}
        {total !== null && (
          <>
            {' '}of {fmt(total)}
            {approx && (
              <button type="button" className="ml-1 rounded px-1 hover:bg-accent hover:text-foreground" title="Compute the exact count" onClick={p.onExactCount} disabled={p.countLoading}>
                (~{p.countLoading ? '…' : ''})
              </button>
            )}
          </>
        )}
      </span>
      <span className="inline-flex items-center gap-0.5">
        <IconButton label="First page" size="sm" onClick={p.onFirst} disabled={p.pageIndex === 0 || p.loading}>
          <ChevronsLeft size={13} strokeWidth={1.75} />
        </IconButton>
        <IconButton label="Previous page" size="sm" onClick={p.onPrev} disabled={p.pageIndex === 0 || p.loading}>
          <ChevronLeft size={13} strokeWidth={1.75} />
        </IconButton>
        <span className="inline-flex items-center gap-1">
          Page
          <input
            key={p.pageIndex}
            defaultValue={p.pageIndex + 1}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const n = Number((e.target as HTMLInputElement).value);
                if (Number.isFinite(n) && n >= 1) p.onGoTo(n);
              }
            }}
            className="h-5 w-14 rounded border border-input bg-background px-1 text-center text-foreground outline-none focus:ring-2 focus:ring-ring"
            title={p.keyset ? 'Jumping to a page switches to offset paging' : undefined}
          />
          {pages !== null && <span>of {fmt(pages)}</span>}
        </span>
        <IconButton label="Next page" size="sm" onClick={p.onNext} disabled={!p.page?.hasMore || p.loading}>
          <ChevronRight size={13} strokeWidth={1.75} />
        </IconButton>
      </span>
      <label className="inline-flex items-center gap-1">
        Page size
        <select value={p.limit} onChange={(e) => p.onPageSize(Number(e.target.value))} className="h-5 rounded border border-input bg-background px-1 text-foreground outline-none">
          {[50, 100, 200, 500, 1000].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <span className="flex-1" />
      {p.keyset && <span title="Keyset paging on the primary key">keyset</span>}
      {p.page && <span>{p.page.durationMs} ms</span>}
      <IconButton label="Refresh" size="sm" onClick={p.onRefresh} disabled={p.loading}>
        <RefreshCw size={13} strokeWidth={1.75} className={p.loading ? 'animate-spin' : undefined} />
      </IconButton>
    </div>
  );
}
