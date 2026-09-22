import type { AppSettings, EnvLabel } from '@shared/ipc';
import { useTheme, type ThemeSetting } from '@renderer/lib/theme';
import { Button, Checkbox, NumberInput, Row, Segmented, Select, Switch, TextInput } from './controls';
import { toggleEnv } from './settingsModel';

export interface PaneProps {
  settings: AppSettings;
  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void;
  num<K extends keyof AppSettings>(key: K, value: number): void;
}

export function AppearancePane({ settings, set }: PaneProps): JSX.Element {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <Row label="Theme" description="Follows the system appearance unless you pick one.">
        <Segmented<ThemeSetting>
          label="Theme"
          value={theme}
          onChange={(v) => {
            setTheme(v);
            set('theme', v);
          }}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' }
          ]}
        />
      </Row>
      <Row label="Density" description="Row heights in trees and grids: 24 / 28 / 32 px.">
        <Segmented<AppSettings['density']>
          label="Density"
          value={settings.density}
          onChange={(v) => set('density', v)}
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'default', label: 'Default' },
            { value: 'comfortable', label: 'Comfortable' }
          ]}
        />
      </Row>
      <Row label="UI font size" description="Base size for labels, menus and trees.">
        <Select<AppSettings['uiFontSize']>
          label="UI font size"
          value={settings.uiFontSize}
          onChange={(v) => set('uiFontSize', v)}
          options={[
            { value: 12, label: '12 px' },
            { value: 13, label: '13 px' },
            { value: 14, label: '14 px' }
          ]}
        />
      </Row>
      <Row label="Show internal schemas" description="Reveals pg_catalog, information_schema and _timescaledb_* in the tree.">
        <Switch label="Show internal schemas" checked={settings.showInternalSchemas} onChange={(v) => set('showInternalSchemas', v)} />
      </Row>
      <p className="pt-3 text-[11px] text-muted-foreground">
        Theme is also stored per machine so the window paints correctly before settings load.
      </p>
    </>
  );
}

export function EditorPane({ settings, set, num }: PaneProps): JSX.Element {
  return (
    <>
      <Row label="Font family" description="Leave empty to use the app's monospace stack (JetBrains Mono).">
        <TextInput label="Editor font family" value={settings.editorFontFamily} placeholder="JetBrains Mono" onCommit={(v) => set('editorFontFamily', v)} />
      </Row>
      <Row label="Font size">
        <NumberInput label="Editor font size" value={settings.editorFontSize} suffix="px" width="w-20" onCommit={(v) => num('editorFontSize', v)} />
      </Row>
      <Row label="Tab size">
        <NumberInput label="Tab size" value={settings.editorTabSize} width="w-20" onCommit={(v) => num('editorTabSize', v)} />
      </Row>
      <Row label="Insert spaces" description="Indent with spaces rather than tab characters.">
        <Switch label="Insert spaces" checked={settings.editorInsertSpaces} onChange={(v) => set('editorInsertSpaces', v)} />
      </Row>
      <Row label="Word wrap">
        <Switch label="Word wrap" checked={settings.editorWordWrap} onChange={(v) => set('editorWordWrap', v)} />
      </Row>
      <Row label="Minimap">
        <Switch label="Minimap" checked={settings.editorMinimap} onChange={(v) => set('editorMinimap', v)} />
      </Row>
      <Row label="Autocomplete" description="Schema-aware suggestions from the catalog index.">
        <Switch label="Autocomplete" checked={settings.editorAutocomplete} onChange={(v) => set('editorAutocomplete', v)} />
      </Row>
      <Row label="Uppercase keywords on format" description="Applies when you format with ⌘⇧F; nothing is reformatted while you type.">
        <Switch label="Uppercase keywords on format" checked={settings.formatUppercaseKeywords} onChange={(v) => set('formatUppercaseKeywords', v)} />
      </Row>
    </>
  );
}

export function QueryPane({ settings, set, num }: PaneProps): JSX.Element {
  return (
    <>
      <Row label="Default row cap" description="Streaming stops at this many rows; a run reports when it was truncated.">
        <NumberInput label="Default row cap" value={settings.queryRowCap} suffix="rows" width="w-28" onCommit={(v) => num('queryRowCap', v)} />
      </Row>
      <Row label="Result memory cap" description="A run also stops once its buffered rows reach this size.">
        <NumberInput label="Result memory cap" value={settings.resultBytesCapMb} suffix="MB" width="w-20" onCommit={(v) => num('resultBytesCapMb', v)} />
      </Row>
      <Row label="Statement timeout" description="0 disables the timeout. Applied to every pooled session.">
        <NumberInput label="Statement timeout" value={settings.statementTimeoutMs} suffix="ms" width="w-24" onCommit={(v) => num('statementTimeoutMs', v)} />
      </Row>
      <Row label="Autocommit by default" description="New query tabs start in autocommit; manual mode issues BEGIN on the first statement.">
        <Switch label="Autocommit by default" checked={settings.autocommitDefault} onChange={(v) => set('autocommitDefault', v)} />
      </Row>
      <Row label="Continue on error" description="Keep running the remaining statements of a script after one fails.">
        <Switch label="Continue on error" checked={settings.continueOnError} onChange={(v) => set('continueOnError', v)} />
      </Row>
      <Row label="Offer terminate after" description="How long a cancel may run before the app offers to terminate the backend.">
        <NumberInput label="Offer terminate after" value={settings.cancelTerminateAfterMs} suffix="ms" width="w-24" onCommit={(v) => num('cancelTerminateAfterMs', v)} />
      </Row>
    </>
  );
}

const ENVS: EnvLabel[] = ['prod', 'staging', 'dev', 'local'];

export function SafetyPane({ settings, set, num }: PaneProps): JSX.Element {
  return (
    <>
      <Row
        label="Confirm destructive actions on"
        description="DROP, TRUNCATE, DELETE of more than 10 rows, terminate backend, drop database."
      >
        <div className="flex items-center gap-3">
          {ENVS.map((env) => (
            <Checkbox
              key={env}
              label={env.toUpperCase()}
              checked={settings.askConfirmAllEnvs || settings.confirmOnEnv.includes(env)}
              onChange={() => set('confirmOnEnv', toggleEnv(settings.confirmOnEnv, env))}
            />
          ))}
        </div>
      </Row>
      <Row
        label="Require typed confirmation on prod"
        description="The object name (or pid / row count) must be typed before the destructive button enables."
      >
        <Switch label="Require typed confirmation on prod" checked={settings.typedConfirmOnProd} onChange={(v) => set('typedConfirmOnProd', v)} />
      </Row>
      <Row
        label="Warn on UPDATE / DELETE without WHERE"
        description="Blocks Run with a confirm dialog showing the statement and the table's row estimate."
      >
        <Switch label="Warn on UPDATE or DELETE without WHERE" checked={settings.warnNoWhere} onChange={(v) => set('warnNoWhere', v)} />
      </Row>
      <Row label="Ask for all destructive actions" description="Force confirmation on every environment, not only the ones ticked above.">
        <Switch label="Ask for all destructive actions" checked={settings.askConfirmAllEnvs} onChange={(v) => set('askConfirmAllEnvs', v)} />
      </Row>
      <Row
        label="Lock timeout for destructive DDL"
        description="Applied with SET LOCAL lock_timeout so a DROP waiting on a lock fails instead of queueing behind traffic."
      >
        <NumberInput label="Lock timeout for destructive DDL" value={settings.destructiveLockTimeoutMs} suffix="ms" width="w-24" onCommit={(v) => num('destructiveLockTimeoutMs', v)} />
      </Row>
      <Row label="Preview SQL before Apply" description="Grid Apply always shows the generated UPDATE / INSERT / DELETE statements first.">
        <Switch label="Preview SQL before Apply" checked={settings.previewSqlBeforeApply} onChange={(v) => set('previewSqlBeforeApply', v)} />
      </Row>
      <div className="pt-3">
        <Button onClick={() => set('confirmOnEnv', ['prod'])}>Reset to prod only</Button>
      </div>
    </>
  );
}
