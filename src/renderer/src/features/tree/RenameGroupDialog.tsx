/**
 * Renames a sidebar group. Groups are not stored anywhere on their own — they exist only as the
 * `group` field of each connection, so the rename re-saves every member. Saving without a password
 * keeps the vault entry, and a group change never counts as a credential change, so connected
 * servers stay connected.
 */
import { useState } from 'react';
import { create } from 'zustand';
import { LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@cloudhub-ux/shadcn/esm/components/ui/dialog';
import { useStore } from '@renderer/store';

interface DialogState {
  group: string | null;
  open(group: string): void;
  close(): void;
}

const useDialogStore = create<DialogState>()((set) => ({
  group: null,
  open: (group) => set({ group }),
  close: () => set({ group: null })
}));

/** Imperative opener used by the tree's "Rename group…" action. */
export function openRenameGroupDialog(group: string): void {
  useDialogStore.getState().open(group);
}

/** Mount once (the catalog tree does). */
export function RenameGroupDialogHost(): JSX.Element {
  const group = useDialogStore((s) => s.group);
  const close = useDialogStore((s) => s.close);
  return (
    <Dialog open={group !== null} onOpenChange={(o) => !o && close()}>
      {group !== null && <Body key={group} group={group} onClose={close} />}
    </Dialog>
  );
}

function Body({ group, onClose }: { group: string; onClose(): void }): JSX.Element {
  const [name, setName] = useState(group);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connections = useStore((s) => s.connections);
  const saveConnection = useStore((s) => s.saveConnection);

  const members = Object.values(connections).filter((c) => (c.group ?? '') === group);
  const trimmed = name.trim();
  const clash = Object.values(connections).some(
    (c) => (c.group ?? '') !== group && (c.group ?? '').toLowerCase() === trimmed.toLowerCase() && trimmed !== ''
  );
  const valid = trimmed !== '' && trimmed !== group && !clash;

  const run = async (): Promise<void> => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      for (const m of members) {
        const { hasPassword: _p, createdAt: _c, updatedAt: _u, ...input } = m;
        await saveConnection({ ...input, group: trimmed });
      }
      toast.success(`Group renamed to “${trimmed}”`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent className="max-w-[420px] gap-0 p-0" onKeyDown={(e) => e.key === 'Enter' && void run()}>
      <DialogHeader className="px-4 pb-2 pt-4">
        <DialogTitle className="text-[14px] font-semibold">Rename group</DialogTitle>
        <DialogDescription className="text-[12.5px]">
          {members.length} connection{members.length === 1 ? '' : 's'} move to the new name.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2 px-4 pb-3 text-[12.5px]">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.target.select()}
          spellCheck={false}
          className="h-7 w-full rounded-md border border-input bg-background px-2 text-[12.5px] outline-none focus:ring-2 focus:ring-ring"
        />
        {clash && <div className="text-[12px] text-destructive">A group named “{trimmed}” already exists.</div>}
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{error}</div>
        )}
      </div>

      <DialogFooter className="gap-2 border-t border-border px-4 py-3 sm:justify-end">
        <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={onClose} disabled={busy}>
          Cancel <span className="kbd ml-1">esc</span>
        </Button>
        <Button size="sm" className="h-7 gap-1 text-[12px]" disabled={!valid || busy} onClick={() => void run()}>
          {busy && <LoaderCircle size={13} strokeWidth={2} className="animate-spin" />}
          Rename
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
