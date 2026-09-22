/**
 * The PgTerminal mark: a prompt chevron followed by the document-link slash, the same glyph as the
 * app icon. Drawn in `currentColor` so it sits on any surface.
 */
export function BrandMark({ size = 20, className }: { size?: number; className?: string }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <polyline points="5,7.5 8.8,12 5,16.5" />
      <line x1="14.2" y1="17.4" x2="18.9" y2="6.6" />
    </svg>
  );
}
