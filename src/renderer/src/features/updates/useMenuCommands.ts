import { useIpcEvent } from '@renderer/lib/ipc';
import { runBindingById } from '@renderer/lib/keybindings';

/**
 * Runs the keybinding an application-menu item names. The menu lives in the main process and only
 * knows ids, so the action stays defined in one place: `lib/keybindings.ts`.
 */
export function useMenuCommands(): void {
  useIpcEvent('app:menuCommand', ({ command }) => {
    if (!runBindingById(command)) {
      console.warn(`[menu] no runnable binding for "${command}"`);
    }
  });
}
