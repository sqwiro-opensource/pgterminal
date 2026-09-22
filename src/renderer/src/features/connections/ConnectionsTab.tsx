import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@cloudhub-ux/shadcn/esm/components/ui/dialog';
import type { ConnectionMeta } from '@shared/ipc';
import { useStore } from '../../store';
import { ConnectionFormFields } from './ConnectionFormFields';
import { ConnectionList } from './ConnectionList';
import { ConnectionFooter, TestResultLine, UriImportPopover, type TestState } from './ConnectionsTabParts';
import { defaultForm, formFromMeta, isDirty, toConnectionInput, validateForm, type ConnectionForm } from './connectionForm';

const btn = 'inline-flex h-7 items-center gap-1.5 rounded-[5px] border border-border bg-background px-2.5 text-[12.5px] font-medium hover:bg-accent disabled:opacity-50';

export function ConnectionsTab(): JSX.Element {
  const { connections, status, editingId, saveConnection, deleteConnection, testConnection, connect, openConnectionsView } = useStore(
    useShallow((s) => ({
      connections: s.connections,
      status: s.status,
      editingId: s.editingConnectionId,
      saveConnection: s.saveConnection,
      deleteConnection: s.deleteConnection,
      testConnection: s.testConnection,
      connect: s.connect,
      openConnectionsView: s.openConnectionsView
    }))
  );
  const list = useMemo(() => Object.values(connections), [connections]);
  const groups = useMemo(() => [...new Set(list.map((c) => c.group?.trim()).filter((g): g is string => !!g))].sort(), [list]);

  const [selectedId, setSelectedId] = useState<string | null>(editingId);
  const [form, setForm] = useState<ConnectionForm>(() => (editingId && connections[editingId] ? formFromMeta(connections[editingId]) : defaultForm()));
  const [baseline, setBaseline] = useState<ConnectionForm>(form);
  const [touched, setTouched] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const [saving, setSaving] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<string | null | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uriOpen, setUriOpen] = useState(false);

  const creating = selectedId === null;
  const dirty = isDirty(form, baseline);
  const existingNames = list.filter((c) => c.id !== form.id).map((c) => c.name);
  const errors = validateForm(form, existingNames);
  const valid = Object.keys(errors).length === 0;

  const load = useCallback((id: string | null, meta?: ConnectionMeta) => {
    const f = id && meta ? formFromMeta(meta) : defaultForm();
    setSelectedId(id);
    setForm(f);
    setBaseline(f);
    setTouched(false);
    setTest({ kind: 'idle' });
  }, []);

  // Follow external "edit this connection" requests (sidebar → ui.editingConnectionId).
  useEffect(() => {
    if (editingId !== selectedId) {
      const meta = editingId ? connections[editingId] : undefined;
      if (editingId && !meta) return;
      if (dirty) setPendingSwitch(editingId);
      else load(editingId, meta);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const requestSelect = (id: string | null): void => {
    if (id === selectedId) return;
    if (dirty) setPendingSwitch(id);
    else openConnectionsView(id);
  };

  const onChange = <K extends keyof ConnectionForm>(key: K, value: ConnectionForm[K]): void => {
    setTouched(true);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const doSave = async (): Promise<ConnectionMeta | null> => {
    setTouched(true);
    if (!valid) return null;
    setSaving(true);
    try {
      const meta = await saveConnection(toConnectionInput(form));
      const f = formFromMeta(meta);
      setSelectedId(meta.id);
      setForm(f);
      setBaseline(f);
      openConnectionsView(meta.id);
      toast.success(`Saved ${meta.name}`);
      return meta;
    } catch (err) {
      toast.error('Could not save connection', { description: (err as Error).message });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const doSaveAndConnect = async (): Promise<void> => {
    const meta = await doSave();
    if (!meta) return;
    try {
      await connect(meta.id, form.askPassword ? form.password || undefined : undefined);
      toast.success(`Connected to ${meta.name}`);
    } catch (err) {
      toast.error(`Could not connect to ${meta.name}`, { description: (err as Error).message });
    }
  };

  const doTest = async (): Promise<void> => {
    setTouched(true);
    if (!valid) return;
    setTest({ kind: 'running' });
    const started = performance.now();
    try {
      const input = toConnectionInput(form);
      const canUseSaved = !!form.id && !input.password && form.hasPassword && !dirty;
      const res = await testConnection(canUseSaved ? { connectionId: form.id as string } : input);
      setTest(res.ok ? { kind: 'ok', result: res } : { kind: 'error', message: res.error?.message ?? 'Connection failed', hint: res.error?.hint, code: res.error?.code });
    } catch (err) {
      setTest({ kind: 'error', message: (err as Error).message });
    } finally {
      void started;
    }
  };

  const doDuplicate = (): void => {
    const f: ConnectionForm = { ...form, id: undefined, name: `${form.name} (copy)`, hasPassword: false, password: '' };
    setSelectedId(null);
    setForm(f);
    setBaseline(defaultForm());
    setTouched(false);
    openConnectionsView(null);
  };

  const doDelete = async (): Promise<void> => {
    if (!form.id) return;
    setConfirmDelete(false);
    try {
      await deleteConnection(form.id);
      toast.success(`Deleted ${form.name}`);
      load(null);
      openConnectionsView(null);
    } catch (err) {
      toast.error('Could not delete connection', { description: (err as Error).message });
    }
  };

  const resolveSwitch = async (action: 'save' | 'discard' | 'cancel'): Promise<void> => {
    const target = pendingSwitch;
    setPendingSwitch(undefined);
    if (action === 'cancel' || target === undefined) return;
    if (action === 'save') {
      const meta = await doSave();
      if (!meta) return;
    }
    const meta = target ? connections[target] : undefined;
    load(target, meta);
    openConnectionsView(target);
  };

  const selectedStatus = form.id ? status[form.id]?.state : undefined;

  return (
    <div className="flex h-full min-h-0">
      <ConnectionList connections={list} status={status} selectedId={selectedId} creating={creating} onSelect={requestSelect} onNew={() => requestSelect(null)} onImportUri={() => setUriOpen(true)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-auto">
        <div className="flex h-11 items-center gap-2 border-b border-border px-5">
          <h1 className="text-[15px] font-semibold">{creating ? 'New connection' : form.name || 'Connection'}</h1>
          {!creating && <span className={`env-badge ${form.env}`}>{form.env}</span>}
          {selectedStatus === 'connected' && <span className="text-[11px] text-success">● connected</span>}
          <div className="flex-1" />
          <UriImportPopover open={uriOpen} onOpenChange={setUriOpen} onImport={(patch) => { setTouched(true); setForm((f) => ({ ...f, ...patch })); }} />
        </div>
        <div className="max-w-[640px] px-5 py-4">
          <ConnectionFormFields form={form} errors={touched ? errors : {}} groups={groups} onChange={onChange} />
          <div className="mt-4 flex items-center gap-3 border-t border-border pt-3">
            <button type="button" className={btn} onClick={doTest} disabled={test.kind === 'running'}>
              Test
            </button>
            <TestResultLine state={test} />
          </div>
        </div>
        <ConnectionFooter
          creating={creating}
          saving={saving}
          canSave={!touched || valid}
          onDuplicate={doDuplicate}
          onDelete={() => setConfirmDelete(true)}
          onSave={() => void doSave()}
          onSaveConnect={() => void doSaveAndConnect()}
        />
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Delete connection “{form.name}”?</DialogTitle>
            <DialogDescription>This removes the saved password from the keychain. Open tabs on this connection will be closed.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" className={btn} onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button type="button" className={`${btn} border-transparent bg-destructive text-white hover:bg-destructive/90`} onClick={() => void doDelete()}>Delete</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingSwitch !== undefined} onOpenChange={(o) => !o && setPendingSwitch(undefined)}>
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogDescription>Save the changes to “{form.name || 'new connection'}” before switching?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" className={btn} onClick={() => void resolveSwitch('cancel')}>Cancel</button>
            <button type="button" className={btn} onClick={() => void resolveSwitch('discard')}>Discard</button>
            <button type="button" className={`${btn} border-transparent bg-primary text-primary-foreground hover:brightness-110`} onClick={() => void resolveSwitch('save')}>Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
