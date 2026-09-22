import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, ExternalLink } from 'lucide-react';
import type { AppInfo, AppSettings, BacklinkScopeMode, ConnectionInput } from '@shared/ipc';
import { getPgui } from '@renderer/lib/ipc';
import { useStore } from '@renderer/store';
import { Button, NumberInput, Row, Select, Switch, TextInput } from './controls';
import { exportConnections, parseConnectionImport } from './settingsModel';
import type { PaneProps } from './PanesGeneral';

export function DataPane({ settings, set, num }: PaneProps): JSX.Element {
  return (
    <>
      <Row label="NULL display text" description="Shown in place of SQL NULL; an empty string still renders as a distinct marker.">
        <TextInput label="NULL display text" value={settings.nullText} width="w-28" onCommit={(v) => set('nullText', v || 'NULL')} />
      </Row>
      <Row label="Date and time format" description="ISO keeps the value exactly as Postgres delivered it.">
        <Select<AppSettings['dateTimeFormat']>
          label="Date and time format"
          value={settings.dateTimeFormat}
          onChange={(v) => set('dateTimeFormat', v)}
          options={[
            { value: 'iso', label: 'ISO (server text)' },
            { value: 'locale', label: 'Locale' }
          ]}
        />
      </Row>
      <Row label="Page size" description="Rows fetched per page in table data tabs.">
        <Select<AppSettings['gridPageSize']>
          label="Page size"
          value={settings.gridPageSize}
          onChange={(v) => set('gridPageSize', v)}
          options={[
            { value: 50, label: '50' },
            { value: 100, label: '100' },
            { value: 200, label: '200' },
            { value: 500, label: '500' },
            { value: 1000, label: '1000' }
          ]}
        />
      </Row>
      <Row label="Estimate counts above" description="Larger tables show the planner estimate with ~ until you ask for an exact count.">
        <NumberInput label="Estimate counts above" value={settings.estimateCountAbove} suffix="rows" width="w-28" onCommit={(v) => num('estimateCountAbove', v)} />
      </Row>
      <Row label="jsonb preview length" description="Characters of a jsonb value shown on one grid line.">
        <NumberInput label="jsonb preview length" value={settings.jsonPreviewLength} suffix="chars" width="w-24" onCommit={(v) => num('jsonPreviewLength', v)} />
      </Row>
    </>
  );
}

export function LinksPane({ settings, set, num }: PaneProps): JSX.Element {
  return (
    <>
      <Row label="FK columns as links" description="A sole-column foreign key renders as a chip pointing at its target row.">
        <Switch label="FK columns as links" checked={settings.linkFkColumns} onChange={(v) => set('linkFkColumns', v)} />
      </Row>
      <Row label="Link unresolved references" description="Show a broken chip for table/id strings whose table does not exist.">
        <Switch label="Link unresolved references" checked={settings.linkUnresolved} onChange={(v) => set('linkUnresolved', v)} />
      </Row>
      <Row label="Hover preview delay">
        <NumberInput label="Hover preview delay" value={settings.linkHoverDelayMs} suffix="ms" width="w-24" onCommit={(v) => num('linkHoverDelayMs', v)} />
      </Row>
      <Row label="Default backlink scope" description="Which tables are scanned when a document opens.">
        <Select<BacklinkScopeMode>
          label="Default backlink scope"
          value={settings.backlinkScopeDefault}
          onChange={(v) => set('backlinkScopeDefault', v)}
          options={[
            { value: 'fkOnly', label: 'FK only' },
            { value: 'sameSchema', label: 'FK + same schema' },
            { value: 'wholeDb', label: 'Whole database' }
          ]}
        />
      </Row>
      <Row label="jsonb scan cap per table" description="Each value scan runs under this statement timeout so a wide table cannot block the panel.">
        <NumberInput label="jsonb scan cap per table" value={settings.backlinkScanTimeoutMs} suffix="ms" width="w-24" onCommit={(v) => num('backlinkScanTimeoutMs', v)} />
      </Row>
    </>
  );
}

export function HistoryPane({ settings, num }: PaneProps): JSX.Element {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Row label="Retention" description="Entries older than this are pruned when history is written.">
        <NumberInput label="Retention" value={settings.historyRetentionDays} suffix="days" width="w-24" onCommit={(v) => num('historyRetentionDays', v)} />
      </Row>
      <Row label="Maximum entries">
        <NumberInput label="Maximum entries" value={settings.historyMax} suffix="entries" width="w-28" onCommit={(v) => num('historyMax', v)} />
      </Row>
      <Row label="Clear history" description="Removes every stored query for every connection. This cannot be undone.">
        <Button
          variant="danger"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void getPgui()['history:clear']({})
              .then(() => toast.success('Query history cleared'))
              .catch((e: Error) => toast.error('Could not clear history', { description: e.message, duration: Infinity }))
              .finally(() => setBusy(false));
          }}
        >
          Clear history
        </Button>
      </Row>
    </>
  );
}

export function ConnectionsPane({ settings, set }: PaneProps): JSX.Element {
  const connections = useStore((s) => s.connections);
  const saveConnection = useStore((s) => s.saveConnection);
  const [importText, setImportText] = useState('');
  const [copied, setCopied] = useState(false);

  const copyExport = (): void => {
    const json = JSON.stringify(exportConnections(Object.values(connections)), null, 2);
    navigator.clipboard.writeText(json).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
        toast.success(`Copied ${Object.keys(connections).length} connections`, { description: 'Passwords are never included.' });
      },
      () => toast.error('Clipboard unavailable')
    );
  };

  const runImport = (): void => {
    let entries;
    try {
      entries = parseConnectionImport(importText);
    } catch (err) {
      toast.error('Import failed', { description: (err as Error).message, duration: Infinity });
      return;
    }
    void (async () => {
      let ok = 0;
      for (const e of entries) {
        try {
          await saveConnection(e as unknown as ConnectionInput);
          ok += 1;
        } catch (err) {
          toast.error(`Could not import ${String(e.name)}`, { description: (err as Error).message, duration: Infinity });
        }
      }
      if (ok > 0) {
        setImportText('');
        toast.success(`Imported ${ok} connection${ok === 1 ? '' : 's'}`, { description: 'Passwords must be entered per connection.' });
      }
    })();
  };

  return (
    <>
      <Row label="Password storage" description="Encrypted with the OS keychain through Electron safeStorage; never written in plain text.">
        <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">safeStorage</span>
      </Row>
      <Row label="Reconnect on launch" description="Connect saved servers that have a stored password when the app starts.">
        <Switch label="Reconnect on launch" checked={settings.reconnectOnLaunch} onChange={(v) => set('reconnectOnLaunch', v)} />
      </Row>
      <Row label="Export connections" description="Copies every saved connection as JSON, without passwords.">
        <Button onClick={copyExport}>
          {copied ? <Check size={14} strokeWidth={1.75} /> : <Copy size={14} strokeWidth={1.75} />}
          {copied ? 'Copied' : 'Copy as JSON'}
        </Button>
      </Row>
      <div className="py-3">
        <div className="text-[13px] font-medium">Import connections</div>
        <div className="mt-0.5 text-[12px] text-muted-foreground">
          Paste an exported list. Each entry needs at least a name and host; passwords are entered afterwards.
        </div>
        <textarea
          aria-label="Connections JSON"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={5}
          placeholder='[{ "name": "adminserver", "host": "…", "port": 5432, "user": "postgres" }]'
          className="mt-2 w-full rounded border border-input bg-background p-2 font-mono text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="mt-2">
          <Button onClick={runImport} disabled={!importText.trim()}>
            Import
          </Button>
        </div>
      </div>
    </>
  );
}

export function AboutPane({ settings, set }: PaneProps): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getPgui()['app:info']()
      .then((i) => {
        if (!cancelled) setInfo(i);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Row label="Version">
        <span className="font-mono text-[12px]">pgui {info?.version ?? '—'}</span>
      </Row>
      <Row label="Runtime">
        <span className="font-mono text-[12px] text-muted-foreground">
          Electron {info?.electron ?? '—'} · {info?.platform ?? '—'}
        </span>
      </Row>
      <Row label="Data directory" description="Connections, settings, workspace and the encrypted vault live here.">
        <span className="max-w-[26rem] truncate font-mono text-[11px] text-muted-foreground" title={info?.dataDir}>
          {info?.dataDir ?? '—'}
        </span>
      </Row>
      <Row label="Automatic updates" description="Checks on launch and installs after you confirm a restart.">
        <Switch label="Automatic updates" checked={settings.autoUpdate} onChange={(v) => set('autoUpdate', v)} />
      </Row>
      <Row label="Check for updates now">
        <Button
          onClick={() => {
            void getPgui()['app:checkForUpdates']()
              .then(() => toast.success('Checking for updates'))
              .catch((e: Error) => toast.error('Update check failed', { description: e.message, duration: Infinity }));
          }}
        >
          Check now
        </Button>
      </Row>
      <Row label="Documentation" description="The specification and design mockups that describe this build.">
        <Button
          onClick={() => {
            void getPgui()['app:openExternal']({ url: 'https://www.postgresql.org/docs/16/index.html' }).catch(() => undefined);
          }}
        >
          <ExternalLink size={14} strokeWidth={1.75} />
          PostgreSQL 16 docs
        </Button>
      </Row>
    </>
  );
}
