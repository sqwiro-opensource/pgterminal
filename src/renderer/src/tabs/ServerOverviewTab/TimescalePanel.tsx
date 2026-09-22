import type { ServerOverview } from '@shared/types/stats';
import { Kpi } from './parts';

/** Only rendered when the server reports the timescaledb extension. */
export function TimescalePanel({ timescale }: { timescale: NonNullable<ServerOverview['timescale']> }) {
  const pct = timescale.compressedRatio === null ? null : timescale.compressedRatio * 100;
  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <h3 className="mb-2 text-[12px] font-semibold text-muted-foreground">TimescaleDB</h3>
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="Hypertables" value={timescale.hypertables} />
        <Kpi label="Chunks" value={timescale.chunks.toLocaleString()} />
        <Kpi label="Compressed" value={pct === null ? '—' : `${pct.toFixed(0)} %`} percent={pct} sub={`${timescale.compressedChunks.toLocaleString()} of ${timescale.chunks.toLocaleString()} chunks`} />
      </div>
    </section>
  );
}
