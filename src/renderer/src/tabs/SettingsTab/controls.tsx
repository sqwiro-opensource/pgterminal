import type { ReactNode } from 'react';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import { Switch } from '@renderer/components/ui/Switch';

/** One labelled setting row: title, optional description, control on the right. */
export function Row({
  label,
  description,
  children,
  className
}: {
  label: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('flex items-start justify-between gap-6 border-b border-border py-3 last:border-b-0', className)}>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{label}</div>
        {description && <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{description}</div>}
      </div>
      <div className="flex flex-none items-center gap-2 pt-0.5">{children}</div>
    </div>
  );
}

/** Section heading inside a pane. */
export function PaneHeader({ title, saved }: { title: string; saved: boolean }): JSX.Element {
  return (
    <div className="mb-1 flex items-center gap-3">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <span
        className={cn(
          'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-opacity',
          saved ? 'bg-success/15 text-success opacity-100' : 'opacity-0'
        )}
      >
        Saved
      </span>
      <span className="ml-auto text-[11px] text-muted-foreground">every field autosaves · no Save button</span>
    </div>
  );
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange(v: T): void;
  label: string;
  className?: string;
}): JSX.Element {
  return (
    <select
      aria-label={label}
      value={String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        const match = options.find((o) => String(o.value) === raw);
        if (match) onChange(match.value);
      }}
      className={cn(
        'h-7 rounded border border-input bg-background px-2 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function NumberInput({
  value,
  onCommit,
  label,
  suffix,
  width = 'w-24'
}: {
  value: number;
  onCommit(v: number): void;
  label: string;
  suffix?: string;
  width?: string;
}): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="number"
        aria-label={label}
        defaultValue={value}
        key={value}
        onBlur={(e) => onCommit(Number(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className={cn(
          'h-7 rounded border border-input bg-background px-2 text-right font-mono text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring',
          width
        )}
      />
      {suffix && <span className="text-[11px] text-muted-foreground">{suffix}</span>}
    </span>
  );
}

export function TextInput({
  value,
  onCommit,
  label,
  placeholder,
  width = 'w-56'
}: {
  value: string;
  onCommit(v: string): void;
  label: string;
  placeholder?: string;
  width?: string;
}): JSX.Element {
  return (
    <input
      type="text"
      aria-label={label}
      defaultValue={value}
      key={value}
      placeholder={placeholder}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={cn(
        'h-7 rounded border border-input bg-background px-2 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring',
        width
      )}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange(v: T): void;
  label: string;
}): JSX.Element {
  return (
    <div role="group" aria-label={label} className="inline-flex h-7 overflow-hidden rounded border border-border">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'px-2.5 text-[12px] transition-colors',
            value === o.value ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }): JSX.Element {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-1.5 text-[12px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
      />
      <span>{label}</span>
    </label>
  );
}

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled
}: {
  children: ReactNode;
  onClick(): void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded border px-2.5 text-[12.5px] font-medium disabled:opacity-45',
        variant === 'danger'
          ? 'border-transparent bg-destructive text-white hover:brightness-110'
          : 'border-border bg-background hover:bg-accent'
      )}
    >
      {children}
    </button>
  );
}

export { Switch };
