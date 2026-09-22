/**
 * Type-aware in-cell editors. Each editor receives the current value, commits a CellValue
 * (strings stay strings — numeric precision is never touched) and closes on Escape.
 */
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { DEFAULT_SENTINEL, isDefaultSentinel, type CellValue, type JsonValue } from '@shared/types/query';
import { classifyType } from '@renderer/lib/format';
import { useResizableBox } from './useResizableBox';
import { useDraggableBox } from './useDraggableBox';
import { ResizeGrip } from './ResizeGrip';

const MonacoJsonEditor = lazy(() => import('@renderer/features/editor/MonacoJsonEditor'));

export interface CellEditorProps {
  dataType: string;
  value: CellValue;
  /** Text typed to start editing (replaces the value). */
  initialText?: string | undefined;
  onCommit(value: CellValue, advance?: 'next' | 'down'): void;
  onCancel(): void;
}

function textOf(v: CellValue): string {
  if (v === null || isDefaultSentinel(v)) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Picks the editor by column type. */
export function CellEditor(p: CellEditorProps) {
  const kind = classifyType(p.dataType);
  if (kind === 'bool') return <BoolEditor {...p} />;
  if (kind === 'json') return <JsonEditor {...p} />;
  return <TextEditor {...p} kind={kind} />;
}

function TextEditor(p: CellEditorProps & { kind: ReturnType<typeof classifyType> }) {
  const [text, setText] = useState(p.initialText ?? textOf(p.value));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    if (p.initialText === undefined) ref.current?.select();
  }, [p.initialText]);
  const commit = (advance?: 'next' | 'down') => {
    if (p.kind === 'number' && text.trim() !== '' && !/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(text.trim())) return; // keep editing until numeric
    p.onCommit(text, advance);
  };
  const isDate = p.kind === 'time';
  return (
    <input
      ref={ref}
      value={text}
      spellCheck={false}
      placeholder={isDate ? 'YYYY-MM-DD HH:MM:SS' : undefined}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') return void (e.preventDefault(), p.onCancel());
        if (e.key === 'Enter') return void (e.preventDefault(), commit('down'));
        if (e.key === 'Tab') return void (e.preventDefault(), commit('next'));
        e.stopPropagation();
      }}
      onBlur={() => commit()}
      className={`h-full w-full bg-background px-2 font-mono text-[12.5px] outline-none ${p.kind === 'number' ? 'text-right' : ''}`}
    />
  );
}

function BoolEditor(p: CellEditorProps) {
  const [v, setV] = useState<boolean | null>(typeof p.value === 'boolean' ? p.value : p.value === 'true' ? true : p.value === 'false' ? false : null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const pick = (next: boolean | null) => p.onCommit(next);
  return (
    <div
      ref={ref}
      tabIndex={0}
      className="flex h-full w-full items-center gap-1 bg-background px-1 font-mono text-[12px] outline-none"
      onKeyDown={(e) => {
        if (e.key === 'Escape') return void p.onCancel();
        if (e.key === ' ' || e.key === 'Enter') return void (e.preventDefault(), pick(v === true ? false : v === false ? null : true));
        if (e.key.toLowerCase() === 't') pick(true);
        if (e.key.toLowerCase() === 'f') pick(false);
        if (e.key.toLowerCase() === 'n') pick(null);
        e.stopPropagation();
      }}
      onBlur={() => p.onCancel()}
    >
      {[true, false, null].map((opt) => (
        <button
          key={String(opt)}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setV(opt);
            pick(opt);
          }}
          className={`rounded px-1.5 ${v === opt ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
        >
          {opt === null ? 'NULL' : String(opt)}
        </button>
      ))}
    </div>
  );
}

function JsonEditor(p: CellEditorProps) {
  const initial = p.value === null ? 'null' : isDefaultSentinel(p.value) ? '' : typeof p.value === 'string' ? p.value : JSON.stringify(p.value, null, 2);
  const [text, setText] = useState(p.initialText ?? initial);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(`cell-json-${Math.random().toString(36).slice(2)}`).current;
  const commit = () => {
    try {
      const parsed = text.trim() === '' ? DEFAULT_SENTINEL : (JSON.parse(text) as JsonValue);
      p.onCommit(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  };
  const box = useResizableBox('jsonEditorWidth', 'jsonEditorHeight', { minW: 320, minH: 140 });
  const drag = useDraggableBox(true);
  return (
    <div
      className="absolute left-0 top-0 z-20 flex flex-col overflow-hidden rounded-md border border-border bg-popover shadow-md"
      style={{
        width: box.width,
        transform: drag.dx || drag.dy ? `translate3d(${drag.dx}px, ${drag.dy}px, 0)` : undefined
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div
        onPointerDown={drag.onHandlePointerDown}
        className={`flex h-6 flex-none items-center gap-2 border-b border-border px-2 text-[11px] font-semibold text-muted-foreground select-none ${drag.dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        <span className="font-mono">{'{}'}</span> Edit JSON
      </div>
      <div style={{ height: box.height }}>
        <Suspense fallback={<textarea className="h-full w-full bg-background p-2 font-mono text-[12px]" value={text} onChange={(e) => setText(e.target.value)} />}>
          <MonacoJsonEditor modelKey={key} value={text} onChange={setText} />
        </Suspense>
      </div>
      <div className="flex items-center gap-2 border-t border-border px-2 py-1 text-[11.5px]">
        {error ? <span className="truncate text-destructive">{error}</span> : <span className="text-muted-foreground">JSON · ⌘⏎ save · esc cancel</span>}
        <div className="flex-1" />
        <button type="button" className="inline-flex h-6 items-center gap-1 rounded px-2 hover:bg-accent" onClick={p.onCancel}>
          <X size={12} strokeWidth={1.75} /> Cancel
        </button>
        <button type="button" className="inline-flex h-6 items-center gap-1 rounded bg-primary px-2 text-primary-foreground" onClick={commit}>
          <Check size={12} strokeWidth={1.75} /> Save
        </button>
      </div>
      <ResizeGrip onPointerDown={box.onGripPointerDown} />
    </div>
  );
}
