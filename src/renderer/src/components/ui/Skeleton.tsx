import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';

/** Local replacement for shadcn's skeleton (its esm build references React without importing it). */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}
