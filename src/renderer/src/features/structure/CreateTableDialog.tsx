/**
 * Create-table dialog: schema/name + a column grid (name, type, nullable, default, PK, identity, comment).
 * "Preview DDL" hands the generated CREATE TABLE to the confirm dialog, which executes it.
 */
import { useState } from 'react';
import { create } from 'zustand';
import { Plus } from 'lucide-react';
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@cloudhub-ux/shadcn/esm/components/ui/dialog';
import { useStore } from '@renderer/store';
import { confirm } from '@renderer/components/ui/ConfirmDialog';
import { executeDdl } from '@renderer/features/tree/ddlActions';
import { buildCreateTable, type NewColumn } from '@renderer/tabs/TableStructureTab/pendingAlters';
import { ColumnGrid } from './ColumnGrid';

interface CreateTableRequest {
  connectionId: string;
  database: string;
  schema: string;
}

interface DialogState {
  req: CreateTableRequest | null;
  open(req: CreateTableRequest): void;
  close(): void;
}

const useDialogStore = create<DialogState>()((set) => ({ req: null, open: (req) => set({ req }), close: () => set({ req: null }) }));

/** Imperative opener used by the tree's "Create table…" action. */
export function openCreateTableDialog(req: CreateTableRequest): void {
  useDialogStore.getState().open(req);
}

const firstColumn = (): NewColumn => ({ name: 'id', dataType: 'bigint', nullable: false, default: '', primaryKey: true, identity: 'always' });

/** Mount once (the catalog tree does). */
export function CreateTableDialogHost(): JSX.Element {
  const req = useDialogStore((s) => s.req);
  const close = useDialogStore((s) => s.close);
  return (
    <Dialog open={req !== null} onOpenChange={(o) => !o && close()}>
      {req && <Body key={`${req.connectionId}/${req.database}/${req.schema}`} req={req} onClose={close} />}
    </Dialog>
  );
}

function Body({ req, onClose }: { req: CreateTableRequest; onClose(): void }) {
  const [schema, setSchema] = useState(req.schema);
  const [name, setName] = useState('');
  const [columns, setColumns] = useState<NewColumn[]>([firstColumn()]);
  const meta = useStore((s) => s.connections[req.connectionId]);
  const typedOnProd = useStore((s) => s.settings.typedConfirmOnProd);
  const valid = name.trim().length > 0 && columns.length > 0 && columns.every((c) => c.name.trim() && c.dataType.trim());
  const schemaNode = useStore((s) => s.nodes[`${req.connectionId}:database/${encodeURIComponent(req.database)}`]);
  const schemas = (schemaNode?.children ?? []).filter((c) => c.kind === 'schema').map((c) => c.name);

  const preview = () => {
    const sql = buildCreateTable(schema.trim(), name.trim(), columns);
    confirm({
      title: `Create table ${schema}.${name.trim()}`,
      verb: 'Create table',
      variant: 'neutral',
      env: meta?.env,
      connectionName: meta?.name,
      summary: `${columns.length} column${columns.length === 1 ? '' : 's'}${columns.some((c) => c.primaryKey) ? '' : ' · no primary key (inline editing will be disabled)'}`,
      typedName: meta?.env === 'prod' && typedOnProd ? name.trim() : undefined,
      buildSql: () => sql,
      onOpenInEditor: (s) => useStore.getState().openTab('query', { connectionId: req.connectionId, database: req.database, sessionId: crypto.randomUUID(), sql: s }, { reuse: false }),
      onConfirm: async (s) => {
        await executeDdl({ connectionId: req.connectionId, database: req.database, sql: s, verb: 'Created table', target: { database: req.database, schema: schema.trim(), name: name.trim() } });
        onClose();
      }
    });
  };

  return (
    <DialogContent className="max-w-[760px] gap-0 p-0">
      <DialogHeader className="px-4 pb-2 pt-4">
        <DialogTitle className="text-[14px] font-semibold">Create table</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 px-4 pb-3 text-[12.5px]">
        <div className="grid grid-cols-[100px_1fr_100px_1fr] items-center gap-2">
          <label className="text-muted-foreground">Schema</label>
          <input list="ct-schemas" value={schema} onChange={(e) => setSchema(e.target.value)} className="h-7 rounded-md border border-input bg-background px-2 font-mono text-[12px] outline-none focus:ring-2 focus:ring-ring" />
          <datalist id="ct-schemas">
            {schemas.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <label className="text-muted-foreground">Table name</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="new_table" className="h-7 rounded-md border border-input bg-background px-2 font-mono text-[12px] outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <ColumnGrid columns={columns} onChange={setColumns} />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 gap-1 text-[12px]" onClick={() => setColumns((c) => [...c, { name: '', dataType: 'text', nullable: true, default: '' }])}>
            <Plus size={13} strokeWidth={1.75} /> Column
          </Button>
          <span className="text-[11.5px] text-muted-foreground">Several PK columns become a table-level PRIMARY KEY.</span>
        </div>
      </div>
      <DialogFooter className="gap-2 border-t border-border px-4 py-3 sm:justify-end">
        <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" className="h-7 text-[12px]" disabled={!valid} onClick={preview}>
          Preview DDL
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}


