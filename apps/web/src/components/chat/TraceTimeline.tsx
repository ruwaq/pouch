'use client';
import type { TraceStep } from '@pouch/domain';

const STATUS_DOT: Record<TraceStep['status'], string> = {
  pending: 'bg-[var(--muted)]',
  active: 'bg-[var(--accent)] animate-pulse',
  complete: 'bg-emerald-400',
  error: 'bg-red-400',
};

export function TraceTimeline({ trace }: { trace: TraceStep[] }) {
  return (
    <ol className="space-y-2 border-l border-[var(--border)] pl-4">
      {trace.map((step) => (
        <li key={step.id} className="relative">
          <span
            className={`absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full ${STATUS_DOT[step.status]}`}
          />
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--muted-2)]">{step.label}</span>
            {step.badge ? (
              <span className="rounded-full bg-[var(--accent)]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                {step.badge}
              </span>
            ) : null}
            {typeof step.durationMs === 'number' ? (
              <span className="text-[10px] text-[var(--muted)]">{step.durationMs}ms</span>
            ) : null}
          </div>
          {step.detail ? <p className="text-xs text-red-300">{step.detail}</p> : null}
        </li>
      ))}
    </ol>
  );
}
