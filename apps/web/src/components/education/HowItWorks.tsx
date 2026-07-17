import { EMPTY_STATE_STEPS, LANDING_STEPS, type FlowStep } from './explanations';

interface HowItWorksProps {
  variant: 'landing' | 'empty-state';
}

/**
 * Visual step-by-step flow diagram explaining how Pouch works.
 *
 * Variants:
 * - `landing`: Full 6-step flow in a 2-column grid (desktop), 1-col (mobile).
 *   Used on the landing page before the user enters the chat.
 * - `empty-state`: Compact 3-step flow in a single column.
 *   Used inside the chat when no messages have been sent yet.
 */
export function HowItWorks({ variant }: HowItWorksProps) {
  const steps: FlowStep[] = variant === 'landing' ? LANDING_STEPS : EMPTY_STATE_STEPS;

  if (variant === 'empty-state') {
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">
          How it works
        </p>
        <div className="space-y-2.5">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-[var(--card)] border border-[var(--border)] flex items-center justify-center text-sm">
                {step.emoji}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--fg)]">{step.title}</p>
                <p className="text-xs text-[var(--muted)] mt-0.5">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Landing variant: full 6-step flow
  return (
    <div className="w-full max-w-2xl mx-auto">
      <h2 className="text-lg font-semibold text-[var(--fg)] text-center mb-6">
        How Pouch Works
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {steps.map((step, i) => (
          <div
            key={i}
            className="
              flex items-start gap-3 p-4
              rounded-xl border border-[var(--border)]
              bg-[var(--card)]
              transition-colors duration-200
            "
          >
            <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center text-lg">
              {step.emoji}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--fg)]">
                {i + 1}. {step.title}
              </p>
              <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}