import { toast } from 'sonner';

/**
 * Consistent wording for a completed copy: "Copied", "Copied SQL", "Copied 3 rows".
 * `what` is a noun phrase, never a sentence, so every surface reads the same way.
 */
export function copyLabel(what?: string): string {
  return what ? `Copied ${what}` : 'Copied';
}

/** One id for every clipboard toast, so repeated copies replace rather than stack. */
const TOAST_ID = 'clipboard';

/**
 * Writes to the clipboard and reports the outcome.
 *
 * Pass `what` where the click has nowhere to show inline feedback (menu and dropdown items):
 * success then raises a brief toast. Omit it when the caller confirms in place, as `CopyButton`
 * does — a tick and a toast for the same click is noise.
 *
 * Clipboard access can reject (denied permission, no focus), which is exactly the case the old
 * fire-and-forget calls swallowed, so failure always surfaces.
 */
export async function copyText(value: string, what?: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    if (what !== undefined) toast.success(copyLabel(what), { id: TOAST_ID });
    return true;
  } catch (err) {
    toast.error('Could not copy to the clipboard', {
      id: TOAST_ID,
      description: err instanceof Error ? err.message : undefined
    });
    return false;
  }
}

/** Resolves a value that may be produced lazily (a whole result set is built only on demand). */
export async function resolveCopyValue(value: string | (() => string | Promise<string>)): Promise<string> {
  return typeof value === 'function' ? await value() : value;
}
