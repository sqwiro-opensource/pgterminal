import { useState } from 'react';
import { Filter as FilterIcon, Plus, X } from 'lucide-react';
import type { FieldInfo } from '@shared/types/query';
import type { Filter, Sort } from '@shared/types/rows';
import { classifyType } from '@renderer/lib/format';
import { chipLabel, filtersToRaw, operatorsFor, parseFilterValue } from './filterModel';

interface Props {
  fields: FieldInfo[];
  filters: Filter[];
  sort: Sort[];
  onFilters(next: Filter[]): void;
  onSort(next: Sort[]): void;
}

const INPUT = 'h-6 rounded border border-input bg-background px-1.5 font-mono text-[12px] outline-none focus:ring-2 focus:ring-ring';

/** Filter chips, a chip builder, the raw-WHERE toggle and sort chips. */
export function FilterBar({ fields, filters, sort, onFilters, onSort }: Props) {
  const rawMode = filters.length === 1 && filters[0]?.op === 'raw';
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ column: string; op: Filter['op']; text: string }>({ column: fields[0]?.name ?? '', op: 'eq', text: '' });
  const [rawText, setRawText] = useState(rawMode ? String(filters[0]?.value ?? '') : '');
  const typeOf = (c: string) => fields.find((f) => f.name === c)?.dataType;
  const draftType = typeOf(draft.column) ?? 'text';
  const ops = operatorsFor(draftType);
  const draftOp = ops.find((o) => o.op === draft.op) ?? ops[0]!;

  const commitDraft = () => {
    if (!draft.column) return;
    const value = parseFilterValue(draftOp.op, draft.text, draftType);
    onFilters([...filters, { column: draft.column, op: draftOp.op, ...(value === undefined ? {} : { value }) }]);
    setAdding(false);
    setDraft((d) => ({ ...d, text: '' }));
  };
  const toRaw = () => {
    const text = filtersToRaw(filters, typeOf);
    setRawText(text);
    onFilters(text ? [{ column: '', op: 'raw', value: text }] : []);
  };
  const applyRaw = () => onFilters(rawText.trim() ? [{ column: '', op: 'raw', value: rawText.trim() }] : []);

  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1.5 border-b border-border px-2 py-1 text-[12px]">
      <FilterIcon size={13} strokeWidth={1.75} className="text-muted-foreground" />
      {rawMode ? (
        <>
          <span className="font-mono text-muted-foreground">WHERE</span>
          <input
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyRaw()}
            onBlur={applyRaw}
            spellCheck={false}
            className={`${INPUT} min-w-[320px] flex-1`}
            placeholder="raw SQL predicate, e.g. country = 'KE' AND balance > 0"
          />
          <button type="button" className="rounded px-1.5 text-muted-foreground hover:bg-accent" onClick={() => onFilters([])}>
            Chips
          </button>
        </>
      ) : (
        <>
          {filters.map((f, i) => (
            <span key={i} className="inline-flex h-6 items-center gap-1 rounded border border-primary/25 bg-primary/10 pl-2 pr-1 font-mono text-[11.5px] text-link">
              {chipLabel(f)}
              <button type="button" aria-label="Remove filter" className="rounded p-0.5 hover:bg-primary/20" onClick={() => onFilters(filters.filter((_, j) => j !== i))}>
                <X size={11} strokeWidth={2} />
              </button>
            </span>
          ))}
          {adding ? (
            <span className="inline-flex items-center gap-1">
              <select value={draft.column} onChange={(e) => setDraft({ ...draft, column: e.target.value })} className={INPUT}>
                {fields.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
              <select value={draftOp.op} onChange={(e) => setDraft({ ...draft, op: e.target.value as Filter['op'] })} className={INPUT}>
                {ops.map((o) => (
                  <option key={o.op} value={o.op}>
                    {o.label}
                  </option>
                ))}
              </select>
              {draftOp.takesValue && (classifyType(draftType) === 'bool' ? (
                <select value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} className={INPUT}>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  autoFocus
                  type={classifyType(draftType) === 'time' && draftType.startsWith('date') ? 'date' : 'text'}
                  value={draft.text}
                  onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                  onKeyDown={(e) => (e.key === 'Enter' ? commitDraft() : e.key === 'Escape' ? setAdding(false) : undefined)}
                  placeholder={draftOp.op === 'in' ? 'a, b, c' : draftOp.op === 'contains' ? '{"k": "v"}' : 'value'}
                  className={`${INPUT} w-40`}
                />
              ))}
              <button type="button" className="h-6 rounded bg-primary px-2 text-primary-foreground" onClick={commitDraft}>
                Apply
              </button>
              <button type="button" className="h-6 rounded px-1.5 text-muted-foreground hover:bg-accent" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => setAdding(true)}>
              <Plus size={12} strokeWidth={1.75} /> Add filter
            </button>
          )}
          <button type="button" className="rounded px-1.5 text-muted-foreground hover:bg-accent" onClick={toRaw} title="Edit as a raw WHERE clause">
            WHERE raw
          </button>
        </>
      )}
      {sort.length > 0 && (
        <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground">
          Sort:
          {sort.map((s) => (
            <span key={s.column} className="inline-flex h-6 items-center gap-1 rounded border border-border bg-muted/60 pl-2 pr-1 font-mono text-[11.5px] text-foreground">
              {s.column} {s.dir === 'asc' ? '↑' : '↓'}
              <button type="button" aria-label="Remove sort" className="rounded p-0.5 hover:bg-accent" onClick={() => onSort(sort.filter((x) => x.column !== s.column))}>
                <X size={11} strokeWidth={2} />
              </button>
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
