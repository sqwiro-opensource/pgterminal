import { memo } from 'react';
import { Braces, ChevronRight, Copy, X } from 'lucide-react';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import type { CellValue, FieldInfo, JsonValue } from '@shared/types/query';
import { JsonTree } from './JsonTree';
import { JsonRaw, JsonViewToggle } from './JsonViewToggle';
import { rowToJson } from './gridModel';

export type RowDetailView = 'tree' | 'json';

export interface RowDetailProps {
  fields: FieldInfo[];
  row: CellValue[] | null;
  title?: string;
  /** Tree or raw JSON; persisted by the caller. */
  view: RowDetailView;
  onViewChange(v: RowDetailView): void;
  /** Whether the column/type list is expanded; persisted by the caller. */
  fieldsOpen: boolean;
  onFieldsOpenChange(v: boolean): void;
  onClose?: () => void;
  onOpenLink?: (value: string) => void;
}

/** Selected row as a collapsible tree or raw JSON. Host it inside a resizable panel. */
export const RowDetail = memo(function RowDetail({
  fields,
  row,
  title,
  view,
  onViewChange,
  fieldsOpen,
  onFieldsOpenChange,
  onClose,
  onOpenLink
}: RowDetailProps) {
  const json = row ? rowToJson(row, fields) : null;
  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="flex h-8 flex-none items-center gap-2 border-b border-border px-2 text-[12px] font-semibold">
        <Braces size={14} strokeWidth={1.75} className="flex-none text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{title ?? 'Row'}</span>
        <JsonViewToggle view={view} onChange={onViewChange} />
        {json && (
          <button
            type="button"
            aria-label="Copy row as JSON"
            className="inline-flex h-6 w-6 flex-none items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => void navigator.clipboard.writeText(JSON.stringify(json, null, 2))}
          >
            <Copy size={12} strokeWidth={1.75} />
          </button>
        )}
        {onClose && (
          <button
            type="button"
            aria-label="Close row detail"
            className="inline-flex h-6 w-6 flex-none items-center justify-center rounded text-muted-foreground hover:bg-accent"
            onClick={onClose}
          >
            <X size={13} strokeWidth={1.75} />
          </button>
        )}
      </div>
      {!json ? (
        <div className="flex flex-1 items-center justify-center px-3 text-center text-[12.5px] text-muted-foreground">
          Select a row to inspect it.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-2">
          <button
            type="button"
            aria-expanded={fieldsOpen}
            onClick={() => onFieldsOpenChange(!fieldsOpen)}
            className="mb-1 inline-flex items-center gap-1 rounded px-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <ChevronRight size={12} strokeWidth={1.75} className={cn('transition-transform', fieldsOpen && 'rotate-90')} />
            {fields.length} columns
          </button>
          {fieldsOpen && (
            <div className="mb-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 px-1 font-mono text-[10.5px] text-muted-foreground">
              {fields.map((f) => (
                <FieldType key={`${f.name}-${f.columnID}`} f={f} />
              ))}
            </div>
          )}
          {view === 'tree' ? (
            <JsonTree value={json as JsonValue} expandDepth={3} onOpenLink={onOpenLink} />
          ) : (
            <JsonRaw value={json} />
          )}
        </div>
      )}
    </div>
  );
});

function FieldType({ f }: { f: FieldInfo }) {
  return (
    <>
      <span className="text-foreground/80">{f.name}</span>
      <span>{f.dataType}</span>
    </>
  );
}
