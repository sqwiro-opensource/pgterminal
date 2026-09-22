import { useState } from 'react';
import { Check, Import, Loader2, XCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@cloudhub-ux/shadcn/esm/components/ui/popover';
import type { TestResult } from '@shared/ipc';
import { isUriError, parseConnectionUri, type ConnectionForm } from './connectionForm';
import { CopyButton } from '@renderer/components/ui/CopyButton';

export type TestState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ok'; result: TestResult }
  | { kind: 'error'; message: string; hint?: string; code?: string };

const btn = 'inline-flex h-7 items-center gap-1.5 rounded-[5px] border border-border bg-background px-2.5 text-[12.5px] font-medium hover:bg-accent disabled:opacity-50';

export function TestResultLine({ state }: { state: TestState }): JSX.Element | null {
  if (state.kind === 'idle') return <span className="text-[12px] text-muted-foreground">Checks the server without saving.</span>;
  if (state.kind === 'running')
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Loader2 size={14} strokeWidth={1.75} className="animate-spin" /> Connecting…
      </span>
    );
  if (state.kind === 'ok') {
    const s = state.result.server;
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-success">
        <Check size={14} strokeWidth={2} /> {s ? `PostgreSQL ${s.version.split(' ')[1] ?? s.version}` : 'OK'} · {state.result.latencyMs} ms
        {s && s.extensions.length > 0 && <span className="text-muted-foreground">· {s.extensions.length} extensions</span>}
      </span>
    );
  }
  const text = [state.code, state.message, state.hint].filter(Boolean).join(' — ');
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] text-destructive">
      <XCircle size={14} strokeWidth={1.75} className="flex-none" />
      <span className="truncate" title={text}>
        {state.message}
        {state.hint && <span className="text-muted-foreground"> · {state.hint}</span>}
      </span>
      <CopyButton value={text} title="Copy error" className="h-5 w-5" />
    </span>
  );
}

export interface ConnectionFooterProps {
  creating: boolean;
  saving: boolean;
  canSave: boolean;
  onDuplicate(): void;
  onDelete(): void;
  onSave(): void;
  onSaveConnect(): void;
}

export function ConnectionFooter({ creating, saving, canSave, onDuplicate, onDelete, onSave, onSaveConnect }: ConnectionFooterProps): JSX.Element {
  return (
    <div className="mt-auto flex h-12 items-center gap-2 border-t border-border px-5">
      {!creating && (
        <>
          <button type="button" className={btn} onClick={onDuplicate}>Duplicate</button>
          <button type="button" className={`${btn} text-destructive`} onClick={onDelete}>Delete</button>
        </>
      )}
      <div className="flex-1" />
      <button type="button" className={btn} onClick={onSave} disabled={saving || !canSave}>Save</button>
      <button type="button" className={`${btn} border-transparent bg-primary text-primary-foreground hover:brightness-110`} onClick={onSaveConnect} disabled={saving || !canSave}>
        {saving ? <Loader2 size={14} strokeWidth={1.75} className="animate-spin" /> : null} Save & Connect
      </button>
    </div>
  );
}

export function UriImportPopover({ open, onOpenChange, onImport }: { open: boolean; onOpenChange(o: boolean): void; onImport(patch: Partial<ConnectionForm>): void }): JSX.Element {
  const [uri, setUri] = useState('');
  const [error, setError] = useState<string | null>(null);
  const apply = (): void => {
    const r = parseConnectionUri(uri);
    if (isUriError(r)) {
      setError(r.error);
      return;
    }
    onImport(r);
    setUri('');
    setError(null);
    onOpenChange(false);
  };
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" className={btn}>
          <Import size={14} strokeWidth={1.75} /> Import from URI
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[420px] p-3">
        <p className="mb-2 text-[12px] text-muted-foreground">Paste a connection URI. Fields are filled in; nothing is saved until you click Save.</p>
        <textarea
          className="h-16 w-full resize-none rounded-[5px] border border-input bg-background p-2 font-mono text-[12px] outline-none focus:ring-2 focus:ring-ring"
          placeholder="postgres://user:password@host:5432/database?sslmode=require"
          value={uri}
          onChange={(e) => { setUri(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); apply(); } }}
        />
        {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className={btn} onClick={() => onOpenChange(false)}>Cancel</button>
          <button type="button" className={`${btn} border-transparent bg-primary text-primary-foreground`} onClick={apply} disabled={!uri.trim()}>Fill form</button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
