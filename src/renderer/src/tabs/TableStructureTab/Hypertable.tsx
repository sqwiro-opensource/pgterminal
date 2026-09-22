import { Layers } from 'lucide-react';
import type { HypertableInfo } from '@shared/types/catalog';
import { Badge } from './parts';

/** Compact TimescaleDB strip shown under the header of a hypertable's structure tab. */
export function Hypertable({ info }: { info: HypertableInfo }) {
  const pct = info.compressionRatio === null ? null : Math.round(info.compressionRatio * 100);
  return (
    <div className="flex h-7 items-center gap-3 border-b border-border bg-muted/40 px-3 text-[11.5px]">
      <Layers size={13} strokeWidth={1.75} className="text-muted-foreground" />
      <span className="font-medium">TimescaleDB hypertable</span>
      <span className="font-mono text-muted-foreground">{info.chunks.toLocaleString()} chunks</span>
      <span className="font-mono text-muted-foreground">
        compression {info.compressionEnabled ? 'on' : 'off'}
        {pct !== null && ` · ${pct} % compressed (${info.compressedChunks.toLocaleString()})`}
      </span>
      {info.retention ? <Badge tone="info">retention {info.retention}</Badge> : <Badge>no retention policy</Badge>}
    </div>
  );
}
