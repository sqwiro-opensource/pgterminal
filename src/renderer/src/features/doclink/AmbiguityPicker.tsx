import { useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { create } from 'zustand';
import { Table2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@cloudhub-ux/shadcn/esm/components/ui/dialog';
import type { DocRef, DocTarget, DocTargetReason } from '@shared/types/doclink';

interface PickerState {
  candidates: DocTarget[];
  ref: DocRef | null;
  resolve: ((t: DocTarget | null) => void) | null;
  open(candidates: DocTarget[], ref: DocRef, resolve: (t: DocTarget | null) => void): void;
  close(t: DocTarget | null): void;
}

const usePickerStore = create<PickerState>()((set, get) => ({
  candidates: [],
  ref: null,
  resolve: null,
  open: (candidates, ref, resolve) => {
    get().resolve?.(null);
    set({ candidates, ref, resolve });
  },
  close: (t) => {
    get().resolve?.(t);
    set({ candidates: [], ref: null, resolve: null });
  }
}));

const REASON_LABEL: Record<DocTargetReason, string> = {
  explicit: 'explicit schema',
  prefixedName: 'schema prefix',
  strippedName: 'prefix stripped',
  searchPath: 'search_path',
  anySchema: 'any schema'
};

let root: Root | null = null;

function ensureHost(): void {
  if (root || typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.id = 'pgui-doclink-picker';
  document.body.appendChild(el);
  root = createRoot(el);
  root.render(<AmbiguityPickerHost />);
}

/** Ask the user which relation a ref means. Resolves to null when dismissed. */
export function pickCandidate(candidates: DocTarget[], ref: DocRef): Promise<DocTarget | null> {
  ensureHost();
  return new Promise((resolve) => usePickerStore.getState().open(candidates, ref, resolve));
}

/** Self-hosted dialog (mounted in its own root) so no shell edit is needed. */
export function AmbiguityPickerHost(): JSX.Element {
  const { candidates, ref, close } = usePickerStore();
  const [focus, setFocus] = useState(0);
  useEffect(() => setFocus(0), [ref]);
  const open = ref !== null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close(null)}>
      <DialogContent
        className="max-w-[480px] gap-0 p-0"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setFocus((f) => Math.min(f + 1, candidates.length - 1));
          if (e.key === 'ArrowUp') setFocus((f) => Math.max(f - 1, 0));
          if (e.key === 'Enter') {
            const c = candidates[focus];
            if (c) close(c);
          }
        }}
      >
        <DialogHeader className="px-4 pb-2 pt-4">
          <DialogTitle className="text-[14px]">
            Which table does <span className="font-mono">{ref?.raw}</span> refer to?
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Several relations match this reference. Your choice is remembered for this session.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-[320px] overflow-auto px-2 pb-3">
          {candidates.map((c, i) => (
            <li key={`${c.schema}.${c.table}`}>
              <button
                type="button"
                className={`flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[12.5px] hover:bg-accent ${i === focus ? 'bg-accent' : ''}`}
                onMouseEnter={() => setFocus(i)}
                onClick={() => close(c)}
              >
                <Table2 size={14} strokeWidth={1.75} className="text-muted-foreground" />
                <span className="font-mono">
                  <span className="text-muted-foreground">{c.schema}.</span>
                  {c.table}
                </span>
                <span className="ml-auto rounded bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
                  {c.rank} · {REASON_LABEL[c.reason]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
