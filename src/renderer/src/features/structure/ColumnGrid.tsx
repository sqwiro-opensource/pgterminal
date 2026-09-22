/** Editable column definition grid shared by the create-table dialog and the structure Columns tab (new rows). */
import { Trash2 } from 'lucide-react';
import type { NewColumn } from '@renderer/tabs/TableStructureTab/pendingAlters';

export const COMMON_TYPES = ['text', 'varchar(255)', 'int4', 'int8', 'bigint', 'numeric(18,2)', 'bool', 'date', 'timestamptz', 'uuid', 'jsonb', 'text[]', 'bytea'];

const INPUT = 'h-6 w-full rounded border border-input bg-background px-1.5 font-mono text-[12px] outline-none focus:ring-2 focus:ring-ring';

export function ColumnGrid({ columns, onChange }: { columns: NewColumn[]; onChange(next: NewColumn[]): void }) {
  const patch = (i: number, p: Partial<NewColumn>) => onChange(columns.map((c, j) => (j === i ? { ...c, ...p } : c)));
  return (
    <div className="overflow-auto rounded-md border border-border">
      <table className="w-full border-separate border-spacing-0 text-[12px]">
        <thead>
          <tr className="bg-grid-header text-left text-[11px] font-medium">
            {['Name', 'Type', 'Nullable', 'Default', 'Primary key', 'Identity', 'Comment', ''].map((h) => (
              <th key={h} className="h-7 whitespace-nowrap border-b border-r border-grid-line px-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columns.map((c, i) => (
            <tr key={i} className={i % 2 ? 'bg-grid-alt' : undefined}>
              <td className="border-b border-r border-grid-line p-1">
                <input value={c.name} onChange={(e) => patch(i, { name: e.target.value })} className={INPUT} placeholder="column" />
              </td>
              <td className="border-b border-r border-grid-line p-1">
                <input list="ct-types" value={c.dataType} onChange={(e) => patch(i, { dataType: e.target.value })} className={INPUT} />
              </td>
              <td className="border-b border-r border-grid-line p-1 text-center">
                <input type="checkbox" checked={c.nullable} onChange={(e) => patch(i, { nullable: e.target.checked })} className="accent-[hsl(var(--primary))]" aria-label="Nullable" />
              </td>
              <td className="border-b border-r border-grid-line p-1">
                <input value={c.default} onChange={(e) => patch(i, { default: e.target.value })} className={INPUT} placeholder="now(), 0, 'x'" />
              </td>
              <td className="border-b border-r border-grid-line p-1 text-center">
                <input type="checkbox" checked={Boolean(c.primaryKey)} onChange={(e) => patch(i, { primaryKey: e.target.checked, ...(e.target.checked ? { nullable: false } : {}) })} className="accent-[hsl(var(--primary))]" aria-label="Primary key" />
              </td>
              <td className="border-b border-r border-grid-line p-1">
                <select value={c.identity ?? ''} onChange={(e) => patch(i, { identity: (e.target.value || null) as NewColumn['identity'] })} className={INPUT}>
                  <option value="">—</option>
                  <option value="always">always</option>
                  <option value="by default">by default</option>
                </select>
              </td>
              <td className="border-b border-r border-grid-line p-1">
                <input value={c.comment ?? ''} onChange={(e) => patch(i, { comment: e.target.value })} className={INPUT} />
              </td>
              <td className="border-b border-grid-line p-1 text-center">
                <button type="button" aria-label="Remove column" className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-destructive" onClick={() => onChange(columns.filter((_, j) => j !== i))}>
                  <Trash2 size={13} strokeWidth={1.75} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <datalist id="ct-types">
        {COMMON_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  );
}
