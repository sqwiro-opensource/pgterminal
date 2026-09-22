import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';

/** Bottom-right corner grip. 14px target with the usual diagonal rules. */
export function ResizeGrip({ onPointerDown, className }: { onPointerDown(e: React.PointerEvent): void; className?: string }): JSX.Element {
  return (
    <span
      role="separator"
      aria-label="Resize"
      onPointerDown={onPointerDown}
      className={cn('absolute bottom-0 right-0 z-10 h-3.5 w-3.5 cursor-nwse-resize', className)}
    >
      <svg viewBox="0 0 14 14" className="h-full w-full text-muted-foreground/70" aria-hidden="true">
        <path d="M13 6 L6 13 M13 10 L10 13" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" fill="none" />
      </svg>
    </span>
  );
}
