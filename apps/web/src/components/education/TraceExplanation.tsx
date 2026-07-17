'use client';

import { useState } from 'react';
import type { TraceStep } from '../../lib/types';
import { STEP_EXPLANATIONS } from './explanations';

interface TraceExplanationProps {
  step: TraceStep;
}

/**
 * Expandable explanation panel for a single trace step.
 * Matches the step label against STEP_EXPLANATIONS using prefix matching
 * (e.g. "Creating order with Bitrefill" matches "Creating order with").
 *
 * Pure display — the expand/collapse state is the only internal state.
 */
export function TraceExplanation({ step }: TraceExplanationProps) {
  const [expanded, setExpanded] = useState(false);

  // Find matching explanation by prefix
  const explanation = Object.entries(STEP_EXPLANATIONS).find(([key]) =>
    step.label.startsWith(key),
  );

  // No explanation for this step → don't render anything
  if (!explanation) return null;

  const [, data] = explanation;

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="
          inline-flex items-center gap-1.5
          text-xs text-[var(--muted)] hover:text-[var(--fg)]
          transition-colors duration-150
          cursor-pointer
        "
        aria-expanded={expanded}
      >
        <span className={`inline-flex transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}>
          ▶
        </span>
        <span className="underline decoration-dotted underline-offset-2">
          {expanded ? 'Hide explanation' : 'What\'s happening?'}
        </span>
      </button>

      {expanded && (
        <div className="
          mt-2 ml-5 pl-3
          border-l-2 border-[var(--accent)]/30
          text-xs leading-relaxed text-[var(--muted)]
          animate-in fade-in slide-in-from-top-1 duration-200
        ">
          <p className="font-medium text-[var(--fg)] mb-1">{data.title}</p>
          <p>{data.body}</p>
        </div>
      )}
    </div>
  );
}