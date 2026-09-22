import { useState, type KeyboardEvent } from 'react';
import { ChevronRight, Braces } from 'lucide-react';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@cloudhub-ux/shadcn/esm/components/ui/popover';
import type { CellValue, FieldInfo, JsonValue } from '@shared/types/query';
import { classifyType, formatCell } from '@renderer/lib/format';
import { isDefaultSentinel } from '@shared/types/query';
import { DocLinkChip } from '@renderer/features/doclink/DocLinkChip';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger, MenuEntries } from '@renderer/components/ui/ContextMenu';
import { coerceInput, setPath, type Row } from './documentModel';
import { copyText } from '@renderer/lib/clipboard';

export interface DocTreeProps {
  fields: FieldInfo[];
  row: Row;
  draft: Row;
  connectionId: string;
  database: string;
  tabId: string;
  readOnlyColumns: string[];
  onChange(column: string, value: CellValue): void;
  onEditJson(column: string): void;
}

const ROW = 'flex min-h-[24px] items-center gap-2 rounded px-1 text-[12.5px] hover:bg-accent/60';

/** Key/value tree of the whole row: top-level columns, nested jsonb expanded, inline editing on double-click. */
export function DocTree(p: DocTreeProps): JSX.Element {
  return (
    <div className="p-2">
      {p.fields.map((f) => (
        <ColumnRow key={f.name} field={f} {...p} />
      ))}
    </div>
  );
}

function ColumnRow({ field, row, draft, connectionId, database, tabId, readOnlyColumns, onChange, onEditJson }: DocTreeProps & { field: FieldInfo }): JSX.Element {
  const value = draft[field.name] ?? null;
  const changed = JSON.stringify(row[field.name] ?? null) !== JSON.stringify(value);
  const kind = classifyType(field.dataType);
  const readOnly = readOnlyColumns.includes(field.name);
  const isJsonObj = kind === 'json' && value !== null && typeof value === 'object';
  const menu = [
    { label: 'Copy value', onSelect: () => void copyText(typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''), 'value') },
    { label: 'Copy column name', onSelect: () => void copyText(field.name, 'column name') },
    { label: 'Set NULL', disabled: readOnly, onSelect: () => onChange(field.name, null) },
    ...(kind === 'json' ? [{ label: 'Edit as JSON…', separatorBefore: true, disabled: readOnly, onSelect: () => onEditJson(field.name) }] : [])
  ];
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={cn('rounded', changed && 'border-l-[3px] border-pending bg-pending/10')}>
          {isJsonObj ? (
            <JsonNode
              name={field.name}
              value={value as JsonValue}
              depth={0}
              path={[]}
              connectionId={connectionId}
              database={database}
              tabId={tabId}
              readOnly={readOnly}
              onLeafChange={(path, next) => onChange(field.name, setPath(value as JsonValue, path, next))}
              typeLabel={field.dataType}
            />
          ) : (
            <div className={ROW}>
              <span className="w-[160px] flex-none truncate font-mono text-[12px] text-muted-foreground" title={field.dataType}>
                {field.name}
              </span>
              <ValueCell
                value={value}
                dataType={field.dataType}
                readOnly={readOnly}
                connectionId={connectionId}
                database={database}
                tabId={tabId}
                onCommit={(v) => onChange(field.name, v)}
              />
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <MenuEntries entries={menu} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

interface ValueCellProps {
  value: CellValue;
  dataType: string;
  readOnly: boolean;
  connectionId: string;
  database: string;
  tabId: string;
  onCommit(v: CellValue): void;
}

/** One editable leaf: double-click to edit, Enter commits, Esc cancels. */
function ValueCell({ value, dataType, readOnly, connectionId, database, tabId, onCommit }: ValueCellProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const f = formatCell(value, dataType);
  const start = (): void => {
    if (readOnly) return;
    setText(value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value));
    setEditing(true);
  };
  const key = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      onCommit(coerceInput(text, dataType, value === null));
      setEditing(false);
    }
    if (e.key === 'Escape') setEditing(false);
  };
  if (editing) {
    return (
      <input
        autoFocus
        className="h-6 flex-1 rounded border border-ring bg-background px-1.5 font-mono text-[12px] outline-none"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={key}
        onBlur={() => setEditing(false)}
      />
    );
  }
  const content =
    typeof value === 'string' && !isDefaultSentinel(value) && f.kind === 'text' && docLinkLike(value) ? (
      <DocLinkChip raw={value} connectionId={connectionId} database={database} fromTabId={tabId} />
    ) : (
      <span
        className={cn(
          'truncate font-mono',
          f.kind === 'null' && 'italic text-muted-foreground/70',
          f.kind === 'number' && 'text-num',
          f.kind === 'bool' && 'text-bool',
          f.kind === 'time' && 'text-time',
          f.kind === 'text' && 'text-str',
          f.kind === 'uuid' && 'text-muted-foreground'
        )}
        title={f.title}
      >
        {f.kind === 'text' ? JSON.stringify(f.text) : f.text}
      </span>
    );
  return (
    <span className="flex min-w-0 flex-1 items-center" onDoubleClick={start} title={readOnly ? 'read-only' : 'Double-click to edit'}>
      {content}
    </span>
  );
}

function docLinkLike(v: string): boolean {
  // Cheap pre-check; the chip itself validates with parseDocRef.
  return v.includes('/') && !/\s/.test(v);
}

interface JsonNodeProps {
  name: string;
  value: JsonValue;
  depth: number;
  path: string[];
  connectionId: string;
  database: string;
  tabId: string;
  readOnly: boolean;
  typeLabel?: string;
  onLeafChange(path: string[], next: JsonValue): void;
}

/** Nested JSON as collapsible rows with editable leaves; refs render as chips. */
function JsonNode(p: JsonNodeProps): JSX.Element {
  const [open, setOpen] = useState(p.depth < 2);
  const isObj = p.value !== null && typeof p.value === 'object';
  const indent = { paddingLeft: 4 + p.depth * 16 };
  if (!isObj) {
    return (
      <div className={ROW} style={indent}>
        <span className="w-[160px] flex-none truncate font-mono text-[12px] text-muted-foreground">{p.name}</span>
        <ValueCell
          value={p.value}
          dataType={typeof p.value === 'number' ? 'numeric' : typeof p.value === 'boolean' ? 'bool' : 'text'}
          readOnly={p.readOnly}
          connectionId={p.connectionId}
          database={p.database}
          tabId={p.tabId}
          onCommit={(v) => p.onLeafChange(p.path, (v ?? null) as JsonValue)}
        />
      </div>
    );
  }
  const isArr = Array.isArray(p.value);
  const entries: Array<[string, JsonValue]> = isArr ? (p.value as JsonValue[]).map((v, i) => [String(i), v]) : Object.entries(p.value as { [k: string]: JsonValue });
  return (
    <div>
      <button type="button" className={cn(ROW, 'w-full text-left')} style={indent} onClick={() => setOpen((o) => !o)}>
        <ChevronRight size={12} strokeWidth={1.75} className={cn('flex-none text-muted-foreground transition-transform', open && 'rotate-90')} />
        <span className="truncate font-mono text-[12px] text-muted-foreground">{p.name}</span>
        <span className="font-mono text-[12px] text-muted-foreground">{isArr ? `[${entries.length}]` : `{${entries.length}}`}</span>
        {p.typeLabel && (
          <Popover>
            <PopoverTrigger asChild>
              <span className="ml-auto inline-flex items-center gap-1 rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                <Braces size={10} strokeWidth={1.75} /> {p.typeLabel}
              </span>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2 text-[11px] text-muted-foreground">Right-click the column to edit it as JSON.</PopoverContent>
          </Popover>
        )}
      </button>
      {open && entries.map(([k, v]) => <JsonNode key={k} {...p} name={k} value={v} depth={p.depth + 1} path={[...p.path, k]} typeLabel={undefined} />)}
    </div>
  );
}
