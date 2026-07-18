'use client';

import type { SecurityResult } from '../../lib/types';

const RISK_STYLES: Record<SecurityResult['riskLevel'], string> = {
  LOW: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  MEDIUM: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  HIGH: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  CRITICAL: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const RISK_ICONS: Record<SecurityResult['riskLevel'], string> = {
  LOW: '🟢',
  MEDIUM: '🟡',
  HIGH: '🟠',
  CRITICAL: '🔴',
};

const RISK_LABELS: Record<SecurityResult['riskLevel'], string> = {
  LOW: 'Low risk',
  MEDIUM: 'Medium risk',
  HIGH: 'High risk',
  CRITICAL: 'Critical',
};

interface SecurityBadgeProps {
  verdict: SecurityResult;
  /** When true, renders inline (compact). When false, renders as a card header. */
  compact?: boolean;
}

/**
 * Renders a risk-level badge with color coding and score.
 * Used in ConfirmationCard and TraceTimeline.
 */
export function SecurityBadge({ verdict, compact = false }: SecurityBadgeProps) {
  const styles = RISK_STYLES[verdict.riskLevel];
  const icon = RISK_ICONS[verdict.riskLevel];
  const label = RISK_LABELS[verdict.riskLevel];

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium border ${styles}`}
      >
        <span className="text-[10px]">{icon}</span>
        <span>{label}</span>
        <span className="opacity-60">· {verdict.riskScore}/100</span>
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${styles}`}>
      <span className="text-sm">{icon}</span>
      <div className="flex flex-col">
        <span className="text-xs font-semibold">{label}</span>
        <span className="text-[10px] opacity-70">
          Risk score: {verdict.riskScore}/100
        </span>
      </div>
    </div>
  );
}