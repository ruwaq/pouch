'use client';
import type { TraceStep } from '@pouch/domain';
import { TechBadge } from '../education/TechBadge';
import { TraceExplanation } from '../education/TraceExplanation';

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
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-[var(--muted-2)]">{step.label}</span>
            {step.badge ? <TechBadge badge={step.badge} /> : null}
            {typeof step.durationMs === 'number' ? (
              <span className="text-[10px] text-[var(--muted)]">{step.durationMs}ms</span>
            ) : null}
          </div>
          {step.detail ? (
            <p className={`text-xs ${step.status === 'error' ? 'text-red-300' : 'text-[var(--muted)]'}`}>
              {step.detail}
            </p>
          ) : null}
          {/* Educational explanation — only for completed steps */}
          {step.status === 'complete' ? <TraceExplanation step={step} /> : null}
        </li>
      ))}
    </ol>
  );
}