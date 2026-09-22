import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import { BINDINGS, displayKeys, onShortcutSheetRequest, type Binding, type BindingGroup } from '@renderer/lib/keybindings';

const GROUP_ORDER: BindingGroup[] = ['Global', 'Tabs', 'Editor', 'Grid', 'Tree', 'Document & links'];

/** One row per binding; duplicate ⌘1–9 entries collapse to a single documented row. */
function visibleBindings(): Binding[] {
  const seen = new Set<string>();
  return BINDINGS.filter((b) => {
    const key = `${b.group}/${b.label}/${displayKeys(b)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** ⌘/ sheet listing every shortcut, generated from the same table the dispatcher uses. */
export function ShortcutSheet(): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => onShortcutSheetRequest((v) => { setOpen(v); if (v) setQ(''); }), []);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = visibleBindings().filter(
      (b) => needle.length === 0 || b.label.toLowerCase().includes(needle) || displayKeys(b).toLowerCase().includes(needle) || b.group.toLowerCase().includes(needle)
    );
    return GROUP_ORDER.map((g) => ({ group: g, rows: rows.filter((b) => b.group === g) })).filter((s) => s.rows.length > 0);
  }, [q]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-background/40 pt-16 backdrop-blur-[1px]"
      onMouseDown={() => setOpen(false)}
      role="presentation"
    >
      <div
        className="flex h-[560px] max-h-[80vh] w-[720px] max-w-[92vw] flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Keyboard shortcuts"
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        <div className="flex h-11 flex-none items-center gap-2 border-b border-border px-3">
          <Search size={14} strokeWidth={1.75} className="flex-none text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter shortcuts"
            aria-label="Filter shortcuts"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          />
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X size={14} strokeWidth={1.75} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
          <div className="columns-1 gap-6 md:columns-2">
            {groups.map(({ group, rows }) => (
              <section key={group} className="mb-4 break-inside-avoid">
                <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{group}</h3>
                <ul className="space-y-0.5">
                  {rows.map((b) => (
                    <li key={b.id} className="flex items-baseline gap-2 py-0.5 text-[12.5px]">
                      <span className={cn('min-w-0 flex-1 truncate', b.run ? 'text-foreground' : 'text-muted-foreground')}>
                        {b.label}
                        {b.ownedBy && <span className="ml-1 text-[10px] text-muted-foreground">({b.ownedBy})</span>}
                      </span>
                      <span className="kbd flex-none">{displayKeys(b)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {groups.length === 0 && <p className="py-6 text-center text-[12.5px] text-muted-foreground">No shortcuts match.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
