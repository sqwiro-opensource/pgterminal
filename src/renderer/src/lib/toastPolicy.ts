import { toast } from 'sonner';

let installed = false;

/**
 * State rules: informational toasts auto-dismiss after 4 s (the Toaster default) but errors
 * stay until the user dismisses them. Sonner has no per-severity duration, so the policy is
 * applied once here rather than repeated at every `toast.error` call site. An explicit
 * `duration` passed by a caller still wins.
 */
export function installToastPolicy(): void {
  if (installed) return;
  installed = true;
  const original = toast.error.bind(toast);
  toast.error = ((message: Parameters<typeof original>[0], data?: Parameters<typeof original>[1]) =>
    original(message, { duration: Number.POSITIVE_INFINITY, ...data })) as typeof toast.error;
}
