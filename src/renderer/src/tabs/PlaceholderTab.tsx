import { Construction } from 'lucide-react';
import type { Tab, TabKind } from '@shared/ipc';

const PHASE: Partial<Record<TabKind, number>> = {
  query: 3,
  'table-data': 5,
  document: 4,
  'server-overview': 6,
  function: 2,
  settings: 7
};

/** Stand-in for tab kinds whose implementation lands in a later phase. */
export default function PlaceholderTab({ tab }: { tab: Tab }): JSX.Element {
  const phase = PHASE[tab.kind];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <Construction size={20} strokeWidth={1.5} />
      <div className="text-[13px]">
        <span className="font-medium text-foreground">{tab.title}</span>
      </div>
      <div className="text-[12px]">{phase ? `Coming in Phase ${phase}` : 'Not implemented yet'}</div>
      <pre className="mt-2 max-w-[560px] overflow-auto rounded border border-border bg-muted p-2 font-mono text-[11px]">
        {JSON.stringify(tab.params, null, 2)}
      </pre>
    </div>
  );
}
