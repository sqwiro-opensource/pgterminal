import { useRef } from 'react';
import { toast } from 'sonner';
import { pgui, useIpcEvent } from '@renderer/lib/ipc';

const TOAST_ID = 'pgui-update';

/**
 * Surfaces `app:updateEvent` as toasts. Renders nothing; mounted once from App.
 * The legacy app used blocking native dialogs for the same flow.
 */
export function UpdateToast(): null {
  const announced = useRef<string | null>(null);

  useIpcEvent('app:updateEvent', (e) => {
    if (e.type === 'none') return;

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
          void pgui['app:quitAndInstall']().catch((err: Error) =>
            toast.error('Restart failed', { description: err.message })
          );
        }
      }
    });
  });

  return null;
}
