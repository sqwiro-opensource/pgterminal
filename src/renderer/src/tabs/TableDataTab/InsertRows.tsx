import { Trash2 } from 'lucide-react';
import { DEFAULT_SENTINEL, isDefaultSentinel, type CellValue, type FieldInfo } from '@shared/types/query';
import type { ColumnInfo } from '@shared/types/catalog';
import { classifyType } from '@renderer/lib/format';

interface Props {
  fields: FieldInfo[];
  columns: ColumnInfo[] | undefined;
  inserts: Array<Record<string, CellValue>>;
  onChange(index: number, patch: Record<string, CellValue>): void;
  onRemove(index: number): void;
}

/** Pending insert rows shown above the grid: defaults muted, required columns highlighted. */
export function InsertRows({ fields, columns, inserts, onChange, onRemove }: Props) {
  if (inserts.length === 0) return null;
  const colInfo = (name: string) => columns?.find((c) => c.name === name);
  return (
    <div className="flex-none overflow-auto border-b border-border bg-pending/5">
      <table className="border-separate border-spacing-0 text-[12px]">
        <thead>
          <tr>
            <th className="h-6 w-8 border-b border-r border-grid-line bg-grid-header" />
            {fields.map((f) => (
              <th key={f.name} className="h-6 whitespace-nowrap border-b border-r border-grid-line bg-grid-header px-2 text-left font-medium">
                {f.name} <span className="font-mono text-[10px] font-normal text-muted-foreground">{f.dataType}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {inserts.map((row, i) => (
            <tr key={i}>
              <td className="border-b border-r border-grid-line px-1 text-center">
                <button type="button" aria-label="Remove new row" className="rounded p-0.5 text-muted-foreground hover:text-destructive" onClick={() => onRemove(i)}>
                  <Trash2 size={12} strokeWidth={1.75} />
                </button>
              </td>
              {fields.map((f) => {
                const info = colInfo(f.name);
                const v = row[f.name];
                const isDefault = v === undefined || isDefaultSentinel(v);
                const required = Boolean(info && !info.nullable && !info.default && !info.identity && !info.generated);
                const kind = classifyType(f.dataType);
                const text = isDefault ? '' : v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
                return (
                  <td key={f.name} className={`border-b border-r border-grid-line p-0.5 ${required && isDefault ? 'bg-destructive/10' : ''}`}>
                    {info?.generated ? (
                      <span className="px-1.5 font-mono text-[11px] italic text-muted-foreground">generated</span>
                    ) : (
                      <input
                        value={text}
                        placeholder={info?.default ?? (info?.identity ? 'identity' : required ? 'required' : 'NULL')}
                        title={required ? 'Required (NOT NULL without default)' : (info?.default ?? undefined)}
                        onChange={(e) => {
                          const t = e.target.value;
                          let val: CellValue;
                          if (t === '') val = info?.default || info?.identity ? DEFAULT_SENTINEL : null;
                          else if (kind === 'bool') val = /^(t|true|1|yes)$/i.test(t);
                          else if (kind === 'json') {
                            try {
                              val = JSON.parse(t) as CellValue;
                            } catch {
                              val = t;
                            }
                          } else val = t;
                          onChange(i, { [f.name]: val });
                        }}
                        className={`h-6 min-w-[120px] rounded border border-input bg-background px-1.5 font-mono text-[12px] outline-none placeholder:italic placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring ${kind === 'number' ? 'text-right' : ''}`}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
