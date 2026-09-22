import { useMemo } from 'react';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import { isLinkShaped } from '@renderer/lib/format';
import { docLinks } from '@renderer/features/doclink/docLinksService';
import { useGridLinkContext } from './cells/linkContext';
import { stringTokenValue, tokenizeJson, type JsonToken } from './jsonTokens';

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

/** Raw pretty-printed JSON, coloured with the same palette as the tree. */
export function JsonRaw({ value, onOpenLink }: { value: unknown; onOpenLink?: (v: string) => void }): JSX.Element {
  const tokens = useMemo(() => tokenizeJson(JSON.stringify(value, null, 2) ?? 'null'), [value]);
  const ctx = useGridLinkContext();
  // Same reference handling as the tree: prefer an explicit handler, else open through the
  // grid's connection context. Without either, a ref is just coloured text.
  const open =
    onOpenLink ??
    (ctx.connectionId && ctx.database && !ctx.editing
      ? (raw: string): void => {
          const ref = docLinks.isRef(raw);
          if (ref) void docLinks.open(ref, { connectionId: ctx.connectionId as string, database: ctx.database as string, fromTabId: ctx.fromTabId });
        }
      : undefined);
  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-foreground/80">
      {tokens.map((t, i) => {
        const str = stringTokenValue(t);
        // A link-shaped string stays clickable here, as it is in the tree.
        if (str !== null && open && isLinkShaped(str)) {
          return (
            <button
              key={i}
              type="button"
              onClick={() => open(str)}
              className="text-link underline decoration-dotted underline-offset-2 hover:decoration-solid"
            >
              {t.text}
            </button>
          );
        }
        return (
          <span key={i} className={CLASS[t.kind]}>
            {t.text}
          </span>
        );
      })}
    </pre>
  );
}

const CLASS: Record<JsonToken['kind'], string> = {
  key: 'text-muted-foreground',
  string: 'text-str',
  number: 'text-num',
  boolean: 'text-bool',
  null: 'italic text-muted-foreground/70',
  punct: 'text-foreground/60',
  space: ''
};
