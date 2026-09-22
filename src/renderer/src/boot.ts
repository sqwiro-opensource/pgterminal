import { toast } from 'sonner';
import { installKeybindings } from './lib/keybindings';
import { useStore } from './store';
import { startWorkspacePersistence } from './store/persist';

let booted = false;

function mark(label: string, t0: number): void {
  if (import.meta.env.DEV) console.info(`[boot] ${label} +${(performance.now() - t0).toFixed(0)}ms`);
}

/**
 * Boot sequence: settings → connections → workspace (tabs restored, hibernated until their
 * connection is up) → persistence + keybindings → optional auto-connect. Idempotent.
 */
export async function boot(): Promise<void> {
  if (booted) return;
  booted = true;
  const t0 = performance.now();
  const s = useStore.getState();

  try {
    await s.loadSettings();
  } catch (err) {
    console.warn('[boot] settings:get failed', (err as Error).message);
  }
  mark('settings', t0);

  try {
    await s.loadConnections();
  } catch (err) {
    toast.error('Could not load connections', { description: (err as Error).message });
  }
  mark('connections', t0);

  try {
    await s.loadWorkspace();
  } catch (err) {
    console.warn('[boot] workspace:load failed', (err as Error).message);
    useStore.setState({ workspaceLoaded: true });
  }
  mark(`workspace (${useStore.getState().tabs.length} tabs)`, t0);

  startWorkspacePersistence();
  installKeybindings();

  const { settings, connections, connect } = useStore.getState();
  if (settings.reconnectOnLaunch) {
    const targets = Object.values(connections).filter((c) => c.hasPassword);
    void Promise.allSettled(
      targets.map((c) =>
        connect(c.id).catch((err: Error) => {
          console.warn(`[boot] reconnect ${c.name} failed`, err.message);
        })
      )
    ).then(() => mark(`reconnect (${targets.length})`, t0));
  }
}
