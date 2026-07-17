'use client';

import { BADGE_EXPLANATIONS } from './explanations';

interface TechBadgeProps {
  badge: string;
  /** Optional custom class for the badge pill */
  className?: string;
}

/**
 * Renders a badge pill with an optional educational tooltip.
 * If the badge has an explanation in BADGE_EXPLANATIONS, it shows a
 * hover tooltip (desktop) or tap tooltip (mobile).
 *
 * Pure display — no side effects, no state beyond the tooltip toggle.
 */
export function TechBadge({ badge, className = '' }: TechBadgeProps) {
  const explanation = BADGE_EXPLANATIONS[badge];

  // Special styling for NO POPUP badge (emerald) vs others (accent)
  const isNoPopup = badge === 'NO POPUP';
  const baseClasses = isNoPopup
    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
    : 'bg-[var(--accent)]/10 text-[var(--muted)] border border-[var(--border)]';

  if (!explanation) {
    // No explanation → render a plain badge
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${baseClasses} ${className}`}>
        {badge}
      </span>
    );
  }

  // With explanation → render badge + tooltip group
  return (
    <span className={`group relative inline-flex items-center ${className}`}>
      {/* Badge pill */}
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium cursor-help ${baseClasses}`}>
        {badge}
        {/* Info dot indicator */}
        <span className="inline-flex h-3 w-3 items-center justify-center rounded-full bg-white/20 text-[10px] leading-none">
          ?
        </span>
      </span>

      {/* Tooltip — appears on hover/focus */}
      <span className="
        invisible opacity-0 group-hover:visible group-hover:opacity-100
        absolute bottom-full left-1/2 -translate-x-1/2 mb-2
        w-64 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3
        text-xs leading-relaxed text-[var(--fg)] shadow-lg
        transition-all duration-200 z-50
        pointer-events-none
      ">
        {explanation}
        {/* Arrow */}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[var(--border)]" />
      </span>
    </span>
  );
}