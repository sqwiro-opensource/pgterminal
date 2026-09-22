import { Unplug } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import type { Tab } from '@shared/ipc';
import { useStore } from '../store';

/** Shown for a restored tab whose connection is not connected. */
export function HibernatedTab({ tab, connectionId }: { tab: Tab; connectionId: string }): JSX.Element {
  const { meta, status, connect, closeTab } = useStore(
    useShallow((s) => ({ meta: s.connections[connectionId], status: s.status[connectionId], connect: s.connect, closeTab: s.closeTab }))
  );
  const [busy, setBusy] = useState(false);
  const name = meta?.name ?? 'This server';
  const connecting = busy || status?.state === 'connecting';

  const doConnect = async (): Promise<void> => {
    setBusy(true);
    try {
      await connect(connectionId);
    } catch (err) {
      toast.error(`Could not connect to ${name}`, { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <Unplug size={22} strokeWidth={1.5} className="text-muted-foreground" />
      <div className="text-[13px]">
        <span className="font-medium">{name}</span> <span className="text-muted-foreground">is disconnected</span>
      </div>
      <div className="text-[12px] text-muted-foreground">
        {tab.title} will reload once the connection is open.
        {!meta && ' The saved connection no longer exists.'}
      </div>
      <div className="mt-1 flex gap-2">
        {meta && (
          <button
            type="button"
            disabled={connecting}
            onClick={doConnect}
            className="h-7 rounded bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50"
          >
            {connecting ? 'Connecting…' : 'Connect'}
          </button>
        )}
        <button
          type="button"
          onClick={() => closeTab(tab.id)}
          className="h-7 rounded border border-border bg-background px-3 text-[12.5px] font-medium hover:bg-accent"
        >
          Close tab
        </button>
      </div>
    </div>
  );
}
