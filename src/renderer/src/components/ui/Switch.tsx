import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';

/**
 * The app's only switch: 30×16 with a 12px thumb, per the design tokens.
 *
 * The thumb is anchored with an explicit `left`; without one an absolutely positioned child
 * starts at its static position (after the button's default padding) and the translate then
 * pushes it outside the track.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled
}: {
  checked: boolean;
  onChange(v: boolean): void;
  label: string;
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-4 w-[30px] flex-none rounded-full p-0 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-input'
      )}
    >
      <span
        className={cn(
          'absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-[14px]' : 'translate-x-0'
        )}
      />
    </button>
  );
}
