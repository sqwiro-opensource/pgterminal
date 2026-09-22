import { useId } from 'react';

/**
 * The PgTerminal mark: the elephant from the app icon, flattened to one colour.
 *
 * The eyes are punched through with a mask rather than painted, so the mark sits on any
 * background. It needs about 20px to read as an elephant; below that use the name instead.
 */
export function BrandMark({ size = 22, className }: { size?: number; className?: string }): JSX.Element {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="#fff" />
        <circle cx="10.2" cy="8.8" r="0.95" fill="#000" />
        <circle cx="13.8" cy="8.8" r="0.95" fill="#000" />
      </mask>
      <g mask={`url(#${id})`} fill="currentColor">
        <ellipse cx="5.9" cy="9.7" rx="4.1" ry="4.6" />
        <ellipse cx="18.1" cy="9.7" rx="4.1" ry="4.6" />
        <ellipse cx="12" cy="9.4" rx="4.9" ry="5.6" />
        <path
          d="M12 13.2C12.5 15.8 11.4 17.9 13.3 19.3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.7"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
