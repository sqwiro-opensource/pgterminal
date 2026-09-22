type ShutdownHook = () => Promise<void> | void;

const hooks: ShutdownHook[] = [];
let shuttingDown: Promise<void> | null = null;

/** Register work to run before the app quits (e.g. closing connection pools). */
export function onShutdown(fn: ShutdownHook): void {
  hooks.push(fn);
}

/** Run all shutdown hooks, bounded by a 2 s race so quit never hangs. */
export function shutdown(): Promise<void> {
  if (shuttingDown) return shuttingDown;
  const all = Promise.allSettled(hooks.map((h) => Promise.resolve().then(h))).then(() => undefined);
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2000));
  shuttingDown = Promise.race([all, timeout]);
  return shuttingDown;
}
