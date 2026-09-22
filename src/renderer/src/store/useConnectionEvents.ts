import { toast } from 'sonner';
import { reconnectNow } from '../features/connections/useReconnect';
import { useIpcEvent } from '../lib/ipc';
import { useStore } from './index';

/** Subscribes once to main's connection events (mounted in Shell). */
export function useConnectionEvents(): void {
  useIpcEvent('connections:event', (ev) => {
    const s = useStore.getState();
    const name = s.connections[ev.connectionId]?.name ?? ev.connectionId;
    if (ev.type === 'poolError') {
      // The connection stays `connected` so tabs keep their state; the status bar shows a warning
      // and the next failing request (or the chip) triggers a single lazy reconnect.
      s.markPoolError(ev.connectionId, ev.error);
      toast.error(`Connection problem on ${name}`, {
        description: ev.error?.message,
        duration: Infinity,
        action: { label: 'Reconnect', onClick: () => reconnectNow(ev.connectionId) }
      });
    } else if (ev.type === 'disconnected') {
      s.markPoolError(ev.connectionId, undefined);
    }
  });
}
