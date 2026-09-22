import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';

export type JsonView = 'tree' | 'json';

/** Tree / JSON segmented control, shared by the row detail and the jsonb cell popover. */
export function JsonViewToggle({ view, onChange }: { view: JsonView; onChange(v: JsonView): void }): JSX.Element {
  return (
    <div className="inline-flex h-6 flex-none overflow-hidden rounded-[5px] border border-border">
      {(['tree', 'json'] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn('px-2 text-[11px] font-medium capitalize text-muted-foreground', view === v && 'bg-accent text-foreground')}
        >
          {v === 'json' ? 'JSON' : 'Tree'}
        </button>
      ))}
    </div>
  );
}

/** Raw pretty-printed JSON, used wherever the JSON view is selected. */
export function JsonRaw({ value }: { value: unknown }): JSX.Element {
  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
