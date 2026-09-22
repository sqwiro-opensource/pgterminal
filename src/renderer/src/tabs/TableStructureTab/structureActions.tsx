/** Small dialogs + confirm flows for Indexes / Constraints / Triggers actions. */
import { useState } from 'react';
import { create } from 'zustand';
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@cloudhub-ux/shadcn/esm/components/ui/dialog';
import { qualify } from '@shared/sql/quote';
import * as PA from './pendingAlters';
import { confirmAndRun, type StructureCtx } from './useStructureActions';

type Form = { kind: 'index' | 'constraint'; ctx: StructureCtx } | null;
const useForm = create<{ form: Form; open(f: Form): void }>()((set) => ({ form: null, open: (form) => set({ form }) }));

export const openIndexForm = (ctx: StructureCtx) => useForm.getState().open({ kind: 'index', ctx });
export const openConstraintForm = (ctx: StructureCtx) => useForm.getState().open({ kind: 'constraint', ctx });

export function dropIndex(ctx: StructureCtx, name: string): void {
  confirmAndRun(ctx, { title: `Drop index ${name}`, verb: 'Drop index', variant: 'destructive', summary: `Drops index ${name} on ${qualify(ctx.node.schema, ctx.node.name)}.`, statements: [`DROP INDEX ${qualify(ctx.node.schema, name)};`], typedName: name });
}
export function reindex(ctx: StructureCtx, name: string): void {
  confirmAndRun(ctx, { title: `Reindex ${name}`, verb: 'Reindex', variant: 'light', summary: 'Rebuilds the index; it is locked for writes while running.', statements: [PA.buildReindex(ctx.node.schema, name)] });
}
export function dropConstraint(ctx: StructureCtx, name: string): void {
  confirmAndRun(ctx, { title: `Drop constraint ${name}`, verb: 'Drop constraint', variant: 'destructive', summary: `Drops constraint ${name} from ${qualify(ctx.node.schema, ctx.node.name)}.`, statements: [`ALTER TABLE ${qualify(ctx.node.schema, ctx.node.name)} DROP CONSTRAINT ${name};`], typedName: name });
}
export function validateConstraint(ctx: StructureCtx, name: string): void {
  confirmAndRun(ctx, { title: `Validate ${name}`, verb: 'Validate', variant: 'light', summary: 'Scans the table to validate every existing row against the constraint.', statements: [PA.buildValidateConstraint(ctx.node.schema, ctx.node.name, name)] });
}
export function toggleTrigger(ctx: StructureCtx, name: string, enable: boolean): void {
  confirmAndRun(ctx, { title: `${enable ? 'Enable' : 'Disable'} trigger ${name}`, verb: enable ? 'Enable' : 'Disable', variant: 'light', summary: `${enable ? 'Enables' : 'Disables'} the trigger on ${qualify(ctx.node.schema, ctx.node.name)}.`, statements: [PA.buildToggleTrigger(ctx.node.schema, ctx.node.name, name, enable)] });
}
export function dropTrigger(ctx: StructureCtx, name: string): void {
  confirmAndRun(ctx, { title: `Drop trigger ${name}`, verb: 'Drop trigger', variant: 'destructive', summary: `Drops trigger ${name} on ${qualify(ctx.node.schema, ctx.node.name)}.`, statements: [`DROP TRIGGER ${name} ON ${qualify(ctx.node.schema, ctx.node.name)};`], typedName: name });
}

const INPUT = 'h-7 w-full rounded-md border border-input bg-background px-2 font-mono text-[12px] outline-none focus:ring-2 focus:ring-ring';

/** Mount once inside the structure tab. */
export function StructureFormsHost() {
  const form = useForm((s) => s.form);
  const close = () => useForm.getState().open(null);
  return (
    <Dialog open={form !== null} onOpenChange={(o) => !o && close()}>
      {form?.kind === 'index' && <IndexForm ctx={form.ctx} onClose={close} />}
      {form?.kind === 'constraint' && <ConstraintForm ctx={form.ctx} onClose={close} />}
    </Dialog>
  );
}

function IndexForm({ ctx, onClose }: { ctx: StructureCtx; onClose(): void }) {
  const cols = ctx.node.columns ?? [];
  const [sel, setSel] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [unique, setUnique] = useState(false);
  const [method, setMethod] = useState('btree');
  const [where, setWhere] = useState('');
  const [concurrently, setConcurrently] = useState(false);
  const toggle = (c: string) => setSel((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  const submit = () => {
    const sql = PA.buildCreateIndex(ctx.node.schema, ctx.node.name, { name, columns: sel, unique, method, where, concurrently });
    onClose();
    confirmAndRun(ctx, { title: `Create index on ${ctx.node.name}`, verb: 'Create index', variant: 'neutral', summary: `${sel.length} column${sel.length === 1 ? '' : 's'} · ${method}${unique ? ' · unique' : ''}${concurrently ? ' · concurrently (cannot run inside a transaction)' : ''}`, statements: [sql] });
  };
  return (
    <DialogContent className="max-w-[560px] gap-0 p-0">
      <DialogHeader className="px-4 pb-2 pt-4"><DialogTitle className="text-[14px] font-semibold">New index</DialogTitle></DialogHeader>
      <div className="space-y-3 px-4 pb-3 text-[12.5px]">
        <label className="block">Name <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${ctx.node.name}_${sel.join('_') || 'col'}_idx`} className={INPUT} /></label>
        <div>
          <div className="mb-1 text-muted-foreground">Columns (click in order)</div>
          <div className="flex flex-wrap gap-1">
            {cols.map((c) => (
              <button key={c.name} type="button" onClick={() => toggle(c.name)} className={`h-6 rounded border px-2 font-mono text-[12px] ${sel.includes(c.name) ? 'border-primary bg-primary/10 text-link' : 'border-border hover:bg-accent'}`}>
                {sel.includes(c.name) ? `${sel.indexOf(c.name) + 1}. ` : ''}{c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={unique} onChange={(e) => setUnique(e.target.checked)} /> Unique</label>
          <label className="inline-flex items-center gap-1.5">Method <select value={method} onChange={(e) => setMethod(e.target.value)} className="h-7 rounded-md border border-input bg-background px-1 text-[12px]">{['btree', 'hash', 'gin', 'gist', 'brin'].map((m) => <option key={m}>{m}</option>)}</select></label>
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={concurrently} onChange={(e) => setConcurrently(e.target.checked)} /> Concurrently</label>
        </div>
        <label className="block">WHERE (partial index) <input value={where} onChange={(e) => setWhere(e.target.value)} placeholder="optional predicate" className={INPUT} /></label>
      </div>
      <DialogFooter className="gap-2 border-t border-border px-4 py-3 sm:justify-end">
        <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={onClose}>Cancel</Button>
        <Button size="sm" className="h-7 text-[12px]" disabled={sel.length === 0} onClick={submit}>Preview SQL</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ConstraintForm({ ctx, onClose }: { ctx: StructureCtx; onClose(): void }) {
  const [name, setName] = useState('');
  const [def, setDef] = useState('');
  const submit = () => {
    const sql = PA.buildAddConstraint(ctx.node.schema, ctx.node.name, name, def);
    onClose();
    confirmAndRun(ctx, { title: `Add constraint ${name}`, verb: 'Add constraint', variant: 'neutral', summary: 'Existing rows are checked unless the definition ends with NOT VALID.', statements: [sql] });
  };
  return (
    <DialogContent className="max-w-[560px] gap-0 p-0">
      <DialogHeader className="px-4 pb-2 pt-4"><DialogTitle className="text-[14px] font-semibold">New constraint</DialogTitle></DialogHeader>
      <div className="space-y-3 px-4 pb-3 text-[12.5px]">
        <label className="block">Name <input value={name} onChange={(e) => setName(e.target.value)} placeholder="orders_total_positive" className={INPUT} /></label>
        <label className="block">Definition <input value={def} onChange={(e) => setDef(e.target.value)} placeholder="CHECK (total >= 0)  ·  UNIQUE (a, b)  ·  FOREIGN KEY (x) REFERENCES s.t(id)" className={INPUT} /></label>
      </div>
      <DialogFooter className="gap-2 border-t border-border px-4 py-3 sm:justify-end">
        <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={onClose}>Cancel</Button>
        <Button size="sm" className="h-7 text-[12px]" disabled={!name.trim() || !def.trim()} onClick={submit}>Preview SQL</Button>
      </DialogFooter>
    </DialogContent>
  );
}
