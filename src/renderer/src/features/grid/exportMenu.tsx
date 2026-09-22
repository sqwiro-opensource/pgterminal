/**
 * Export / copy dropdown for any grid: CSV / JSON / SQL through export:write (save dialog in main),
 * and clipboard copies of the selection.
 */
import { ChevronDown, Download } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@cloudhub-ux/shadcn/esm/components/ui/dropdown-menu';
import type { CellValue, FieldInfo } from '@shared/types/query';
import type { ExportRequest } from '@shared/types/export';
import { quoteIdent } from '@shared/sql/quote';
import { pgterminal } from '@renderer/lib/ipc';
import { copyAsTsv, quoteLiteral, rowToInsert, rowToJson } from './gridModel';
import { copyText } from '@renderer/lib/clipboard';

export interface ExportMenuProps {
  fields: FieldInfo[];
  rows: CellValue[][];
  /** Selected row indexes (empty = all rows of the page). */
  selection?: number[];
  table?: { schema: string; table: string };
  pkColumns?: string[];
  suggestedName: string;
  /** When given, an "All matching rows" option streams every page through this callback. */
  fetchAll?(onProgress: (n: number) => void): Promise<CellValue[][]>;
}

function copy(text: string, what: string): void {
  void copyText(text, what);
}

export function ExportMenu(p: ExportMenuProps) {
  const sel = p.selection && p.selection.length ? p.selection : null;
  const selRows = sel ? sel.map((i) => p.rows[i]).filter((r): r is CellValue[] => Boolean(r)) : p.rows;
  const write = async (format: ExportRequest['format'], all: boolean) => {
    let rows = selRows;
    if (all && p.fetchAll) {
      const id = toast.loading('Fetching all matching rows…');
      try {
        rows = await p.fetchAll((n) => toast.loading(`Fetched ${n.toLocaleString()} rows…`, { id }));
      } finally {
        toast.dismiss(id);
      }
    }
    const id = toast.loading(`Writing ${rows.length.toLocaleString()} rows…`);
    try {
      const res = await pgterminal['export:write']({ format, fields: p.fields, rows, table: p.table, suggestedName: p.suggestedName });
      // A null result means the save dialog was dismissed, which is not a failure.
      if (res) toast.success(`Exported ${rows.length.toLocaleString()} rows`, { id, description: res.path });
      else toast.dismiss(id);
    } catch (err) {
      toast.error('Export failed', { id, description: err instanceof Error ? err.message : String(err) });
    }
  };
  const whereClause = () => {
    const pk = p.pkColumns ?? [];
    const idx = pk.map((c) => p.fields.findIndex((f) => f.name === c));
    const rows = selRows;
    if (!pk.length || idx.some((i) => i < 0) || !rows.length) {
      toast.error('No primary key in this result');
      return;
    }
    const clauses = rows.map((r) => `(${pk.map((c, j) => `${quoteIdent(c)} = ${quoteLiteral(r[idx[j] as number] ?? null, p.fields[idx[j] as number]?.dataType)}`).join(' AND ')})`);
    copy(clauses.length === 1 ? clauses[0]! : clauses.join(' OR '), 'WHERE clause');
  };
  const idCol = p.fields.findIndex((f) => f.name === '_id');
  const n = selRows.length;
  const label = sel ? `${n} selected` : `${n} on page`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[12px] font-medium hover:bg-accent">
          <Download size={13} strokeWidth={1.75} /> Export <ChevronDown size={12} strokeWidth={1.75} className="text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px] text-[12.5px]">
        <DropdownMenuLabel className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Export ({label})</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void write('csv', false)}>CSV…</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void write('json', false)}>JSON…</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void write('sql', false)} disabled={!p.table}>
          SQL INSERTs…
        </DropdownMenuItem>
        {p.fetchAll && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10.5px] uppercase tracking-wider text-muted-foreground">All matching rows</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => void write('csv', true)}>CSV (all)…</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void write('json', true)}>JSON (all)…</DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Copy ({label})</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => copy(copyAsTsv(p.rows, p.fields, sel ?? []), 'as TSV')}>As TSV</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => copy(JSON.stringify(selRows.map((r) => rowToJson(r, p.fields)), null, 2), 'as JSON')}>As JSON</DropdownMenuItem>
        <DropdownMenuItem disabled={!p.table} onSelect={() => p.table && copy(selRows.map((r) => rowToInsert(r, p.fields, p.table!.schema, p.table!.table)).join('\n'), 'as INSERT')}>
          As INSERT
        </DropdownMenuItem>
        <DropdownMenuItem disabled={idCol < 0} onSelect={() => copy(selRows.map((r) => String(r[idCol] ?? '')).join('\n'), '_id values')}>
          _id values
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!p.pkColumns?.length} onSelect={whereClause}>
          WHERE clause
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
