import { useState } from 'react';
import { ChevronRight, Eye, EyeOff } from 'lucide-react';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import { Switch } from '@cloudhub-ux/shadcn/esm/components/ui/switch';
import { Checkbox } from '@cloudhub-ux/shadcn/esm/components/ui/checkbox';
import type { EnvLabel, SslMode } from '@shared/ipc';
import { ENV_LABELS, SSL_MODES, type ConnectionForm, type FormErrors } from './connectionForm';

export interface ConnectionFormFieldsProps {
  form: ConnectionForm;
  errors: FormErrors;
  groups: string[];
  onChange<K extends keyof ConnectionForm>(key: K, value: ConnectionForm[K]): void;
}

const inputCls =
  'h-7 w-full rounded-[5px] border border-input bg-background px-2 text-[12.5px] outline-none focus:ring-2 focus:ring-ring disabled:opacity-50';

function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="mb-2.5 grid grid-cols-[120px_1fr] items-center gap-x-3">
      <label className="text-[12.5px] text-muted-foreground">{label}</label>
      <div className="min-w-0">
        {children}
        {error ? <p className="mt-0.5 text-[11px] text-destructive">{error}</p> : hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

export function ConnectionFormFields({ form, errors, groups, onChange }: ConnectionFormFieldsProps): JSX.Element {
  const [showPw, setShowPw] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  return (
    <div>
      <Field label="Name" error={errors.name}>
        <input className={cn(inputCls, errors.name && 'border-destructive')} value={form.name} onChange={(e) => onChange('name', e.target.value)} autoFocus placeholder="adminserver" />
      </Field>
      <Field label="Group">
        <input className={inputCls} list="pgui-connection-groups" value={form.group} onChange={(e) => onChange('group', e.target.value)} placeholder="Production" />
        <datalist id="pgui-connection-groups">
          {groups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </Field>
      <Field label="Environment">
        <div className="inline-flex h-7 overflow-hidden rounded-[5px] border border-border">
          {ENV_LABELS.map((env: EnvLabel) => (
            <button
              key={env}
              type="button"
              onClick={() => onChange('env', env)}
              className={cn('px-2.5 text-[12px] capitalize text-muted-foreground', form.env === env && 'bg-accent text-foreground')}
            >
              {env === 'prod' ? 'Prod' : env.charAt(0).toUpperCase() + env.slice(1)}
            </button>
          ))}
        </div>
      </Field>
      <div className="mb-2.5 grid grid-cols-[120px_1fr_44px_90px] items-center gap-x-3">
        <label className="text-[12.5px] text-muted-foreground">Host</label>
        <div>
          <input className={cn(inputCls, errors.host && 'border-destructive')} value={form.host} onChange={(e) => onChange('host', e.target.value)} placeholder="adminserver.tailnet.ts.net" />
          {errors.host && <p className="mt-0.5 text-[11px] text-destructive">{errors.host}</p>}
        </div>
        <label className="text-right text-[12.5px] text-muted-foreground">Port</label>
        <div>
          <input className={cn(inputCls, 'font-mono', errors.port && 'border-destructive')} inputMode="numeric" value={form.port} onChange={(e) => onChange('port', e.target.value.replace(/[^\d]/g, ''))} />
          {errors.port && <p className="mt-0.5 text-[11px] text-destructive">{errors.port}</p>}
        </div>
      </div>
      <Field label="Database" error={errors.defaultDatabase} hint="Default database to open">
        <input className={inputCls} value={form.defaultDatabase} onChange={(e) => onChange('defaultDatabase', e.target.value)} />
      </Field>
      <Field label="User" error={errors.user}>
        <input className={inputCls} value={form.user} onChange={(e) => onChange('user', e.target.value)} />
      </Field>
      <Field label="Password" hint={form.hasPassword && !form.password && !form.askPassword ? 'Stored in the keychain. Leave blank to keep it.' : undefined}>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              className={cn(inputCls, 'pr-7')}
              type={showPw ? 'text' : 'password'}
              value={form.password}
              disabled={form.askPassword}
              onChange={(e) => onChange('password', e.target.value)}
              placeholder={form.askPassword ? 'Prompted on connect' : form.hasPassword ? '••••••••' : ''}
            />
            <button type="button" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw((v) => !v)} className="absolute right-1 top-1 text-muted-foreground hover:text-foreground">
              {showPw ? <EyeOff size={14} strokeWidth={1.75} /> : <Eye size={14} strokeWidth={1.75} />}
            </button>
          </div>
          <label className="flex items-center gap-1.5 whitespace-nowrap text-[12px]">
            <Checkbox checked={form.askPassword} onCheckedChange={(v) => onChange('askPassword', v === true)} /> Ask every time
          </label>
        </div>
      </Field>
      <Field label="SSL mode">
        <select className={cn(inputCls, 'w-auto min-w-[140px]')} value={form.sslMode} onChange={(e) => onChange('sslMode', e.target.value as SslMode)}>
          {SSL_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Read-only" hint="Opens sessions with default_transaction_read_only=on">
        <Switch checked={form.readOnly} onCheckedChange={(v) => onChange('readOnly', v)} />
      </Field>
      <button type="button" onClick={() => setAdvanced((v) => !v)} className="mb-2 inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
        <ChevronRight size={14} strokeWidth={1.75} className={cn('transition-transform', advanced && 'rotate-90')} /> Advanced
      </button>
      {advanced && (
        <div className="ml-4 border-l border-border pl-4">
          <Field label="Connect timeout" error={errors.connectTimeoutMs} hint="ms">
            <input className={cn(inputCls, 'w-28 font-mono')} inputMode="numeric" value={form.connectTimeoutMs} onChange={(e) => onChange('connectTimeoutMs', e.target.value)} />
          </Field>
          <Field label="Statement timeout" error={errors.statementTimeoutMs} hint="ms · 0 = none">
            <input className={cn(inputCls, 'w-28 font-mono')} inputMode="numeric" value={form.statementTimeoutMs} onChange={(e) => onChange('statementTimeoutMs', e.target.value)} />
          </Field>
          <Field label="Pool size" error={errors.poolMax} hint="max clients per database">
            <input className={cn(inputCls, 'w-28 font-mono')} inputMode="numeric" value={form.poolMax} onChange={(e) => onChange('poolMax', e.target.value)} />
          </Field>
        </div>
      )}
    </div>
  );
}
