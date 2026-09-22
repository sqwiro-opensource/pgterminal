import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@cloudhub-ux/shadcn/esm/lib/utils';
import type { AppSettings, Tab } from '@shared/ipc';
import { useStore } from '@renderer/store';
import { PaneHeader } from './controls';
import { AboutPane, ConnectionsPane, DataPane, HistoryPane, LinksPane } from './PanesData';
import { AppearancePane, EditorPane, QueryPane, SafetyPane, type PaneProps } from './PanesGeneral';
import { clampNumeric, SECTIONS, SECTION_LABELS, type SectionId } from './settingsModel';

const PANES: Record<SectionId, (p: PaneProps) => JSX.Element> = {
  appearance: AppearancePane,
  editor: EditorPane,
  query: QueryPane,
  safety: SafetyPane,
  data: DataPane,
  links: LinksPane,
  history: HistoryPane,
  connections: ConnectionsPane,
  about: AboutPane
};

/**
 * Settings tab: left nav plus one pane per section. Every control writes through
 * `updateSettings`, which persists via main; there is no Save button.
 */
export default function SettingsTab(_props: { tab: Tab<'settings'> }): JSX.Element {
  const [section, setSection] = useState<SectionId>('appearance');
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<number | null>(null);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);

  const flashSaved = useCallback(() => {
    setSaved(true);
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 1600);
  }, []);

  const set = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]): void => {
      void updateSettings({ [key]: value } as Partial<AppSettings>)
        .then(flashSaved)
        .catch((err: Error) => toast.error('Could not save setting', { description: err.message, duration: Infinity }));
    },
    [updateSettings, flashSaved]
  );

  const num = useCallback(
    <K extends keyof AppSettings>(key: K, value: number): void => {
      set(key, clampNumeric(key, value) as AppSettings[K]);
    },
    [set]
  );

  const Pane = PANES[section];

  return (
    <div className="flex h-full min-h-0">
      <nav aria-label="Settings sections" className="w-[180px] flex-none border-r border-border bg-sidebar py-2">
        {SECTIONS.map((id) => (
          <button
            key={id}
            type="button"
            aria-current={section === id}
            onClick={() => setSection(id)}
            className={cn(
              'flex h-7 w-full items-center px-3 text-left text-[13px]',
              section === id ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/60'
            )}
          >
            {SECTION_LABELS[id]}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl px-6 py-5">
          <PaneHeader title={SECTION_LABELS[section]} saved={saved} />
          <Pane settings={settings} set={set} num={num} />
        </div>
      </div>
    </div>
  );
}
