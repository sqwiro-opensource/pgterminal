import { useRef } from 'react';
import { toast } from 'sonner';
import { pgterminal, useIpcEvent } from '@renderer/lib/ipc';
import { useMenuCommands } from './useMenuCommands';

const TOAST_ID = 'pgterminal-update';

/**
 * Surfaces `app:updateEvent` as toasts, and runs application-menu commands. Renders nothing;
 * mounted once from App. The legacy app used blocking native dialogs for the same flow.
 *
 * An automatic check stays silent unless it has news. A check a person asked for always answers,
 * because a menu item that appears to do nothing reads as broken.
 */
export function UpdateToast(): null {
  const announced = useRef<string | null>(null);
  useMenuCommands();

  useIpcEvent('app:updateEvent', (e) => {
    if (e.type === 'checking') {
      if (e.manual) toast.loading('Checking for updates…', { id: TOAST_ID });
      return;
    }

    if (e.type === 'none') {
      if (!e.manual) return;
      toast.success(e.unsupported ? 'Updates are only checked in the installed app' : "You're up to date", {
        id: TOAST_ID,
        duration: 4000
      });
      return;
    }

    if (e.type === 'error') {
      toast.warning('Update check failed', { description: e.message, id: `${TOAST_ID}-error` });
      return;
    }

    if (e.type === 'available') {
      // Only announce a given version once; electron-updater can re-emit on retries.
      if (announced.current === `available:${e.version}`) return;
      announced.current = `available:${e.version}`;
      toast.info(e.version ? `Update ${e.version} available` : 'Update available', {
        description: 'Downloading in the background…',
        id: TOAST_ID
      });
      return;
    }

    toast.success(e.version ? `Update ${e.version} ready` : 'Update ready', {
      description: 'Restart to finish installing.',
      id: TOAST_ID,
      duration: Infinity,
      action: {
        label: 'Restart',
        onClick: () => {
          void pgterminal['app:quitAndInstall']().catch((err: Error) =>
            toast.error('Restart failed', { description: err.message })
          );
        }
      }
    });
  });

  return null;
}
