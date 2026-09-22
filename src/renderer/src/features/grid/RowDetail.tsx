import { memo } from 'react';
import { Braces, Copy, X } from 'lucide-react';
import type { CellValue, FieldInfo, JsonValue } from '@shared/types/query';
import { JsonTree } from './JsonTree';
import { rowToJson } from './gridModel';

export interface RowDetailProps {
  fields: FieldInfo[];
  row: CellValue[] | null;
  title?: string;
  onClose?: () => void;
  onOpenLink?: (value: string) => void;
}

/** Selected row as a JSON tree with field types. Host it inside a resizable panel. */
export const RowDetail = memo(function RowDetail({ fields, row, title, onClose, onOpenLink }: RowDetailProps) {
  const json = row ? rowToJson(row, fields) : null;
  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="flex h-8 flex-none items-center gap-2 border-b border-border px-3 text-[12px] font-semibold">
        <Braces size={14} strokeWidth={1.75} className="text-muted-foreground" />
        <span className="truncate">{title ?? 'Row'}</span>
        {json && (
          <button
            type="button"
            className="ml-auto inline-flex h-6 items-center gap-1 rounded px-2 text-[11.5px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => void navigator.clipboard.writeText(JSON.stringify(json, null, 2))}
          >
            <Copy size={12} strokeWidth={1.75} /> Copy
          </button>
        )}
        {onClose && (
          <button type="button" aria-label="Close row detail" className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent" onClick={onClose}>
            <X size={13} strokeWidth={1.75} />
          </button>
        )}
      </div>
      {!json ? (
        <div className="flex flex-1 items-center justify-center text-[12.5px] text-muted-foreground">Select a row to inspect it.</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-2">
          <div className="mb-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 px-1 font-mono text-[10.5px] text-muted-foreground">
            {fields.map((f) => (
              <FieldType key={`${f.name}-${f.columnID}`} f={f} />
            ))}
          </div>
          <JsonTree value={json as JsonValue} expandDepth={3} onOpenLink={onOpenLink} />
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
