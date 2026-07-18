'use client';

import { useChat } from '../../context/chat-context';
import { TechBadge } from '../education/TechBadge';

const BADGE_COLORS: Record<string, string> = {
  'NO POPUP': 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
  'UA 7702': 'bg-violet-400/15 text-violet-300 border-violet-400/30',
  'SHIELD': 'bg-blue-400/15 text-blue-300 border-blue-400/30',
  'SAFE': 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
  'WARN': 'bg-amber-400/15 text-amber-300 border-amber-400/30',
  'BLOCKED': 'bg-red-400/15 text-red-300 border-red-400/30',
};

const STATUS_ICONS: Record<string, string> = {
  'complete': '✅',
  'active': '⏳',
  'pending': '⬜',
  'error': '❌',
};

export function LiveTracePanel() {
  const { messages } = useChat();

  // Get the latest trace from the most recent agent message
  const lastAgentMsg = [...messages].reverse().find((m) => m.role === 'agent');
  const trace = lastAgentMsg?.response?.trace ?? [];
  const phase = lastAgentMsg?.response?.phase;
  const intent = lastAgentMsg?.response?.intent;
  const securityVerdict = lastAgentMsg?.response?.securityVerdict;

  if (trace.length === 0 && !intent) {
    return (
      <PanelCard title="🔍 Live Trace">
        <p className="text-xs text-[var(--muted)]">
          Send a message to see the trace timeline appear here in real-time.
        </p>
        <div className="mt-3 space-y-2">
          <SuggestionChip text="Show my balance" />
          <SuggestionChip text="What is EIP-7702?" />
          <SuggestionChip text="Cash out $10 to Amazon" />
        </div>
      </PanelCard>
    );
  }

  return (
    <PanelCard title="🔍 Live Trace">
      <div className="space-y-3">
        {/* Intent */}
        {intent && (
          <div className="flex items-center gap-2 rounded-lg bg-[var(--accent)]/5 px-3 py-2">
            <span className="text-xs text-[var(--muted)]">Intent:</span>
            <span className="rounded bg-[var(--accent)]/15 px-2 py-0.5 text-xs font-medium text-[var(--accent)]">
              {intent.action}
            </span>
            {intent.amount?.value > 0 && (
              <span className="text-xs text-[var(--muted)]">${intent.amount.value.toFixed(2)}</span>
            )}
            {intent.brand && (
              <span className="text-xs text-[var(--muted)]">→ {intent.brand}</span>
            )}
          </div>
        )}

        {/* Phase */}
        {phase && (
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <span>Phase:</span>
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${
              phase === 'confirmation' ? 'bg-amber-400/15 text-amber-300' :
              phase === 'executed' ? 'bg-emerald-400/15 text-emerald-300' :
              'bg-[var(--border)] text-[var(--fg)]'
            }`}>
              {phase}
            </span>
          </div>
        )}

        {/* Security verdict */}
        {securityVerdict && (
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
            securityVerdict.verdict === 'BLOCK' ? 'bg-red-400/10 text-red-300' :
            securityVerdict.verdict === 'WARN' ? 'bg-amber-400/10 text-amber-300' :
            'bg-emerald-400/10 text-emerald-300'
          }`}>
            <span>🛡️ Security: {securityVerdict.verdict}</span>
            {securityVerdict.riskScore !== undefined && (
              <span className="text-[var(--muted)]">(risk: {securityVerdict.riskScore}/100)</span>
            )}
          </div>
        )}

        {/* Trace steps */}
        {trace.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              Execution Trace
            </span>
            <div className="space-y-1">
              {trace.map((step, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 rounded border px-3 py-2 text-xs transition-all ${
                    step.status === 'active' ? 'border-[var(--accent)]/50 bg-[var(--accent)]/5' :
                    step.status === 'complete' ? 'border-[var(--border)] bg-[var(--bg)]' :
                    'border-[var(--border)]/30 bg-[var(--bg)]/50'
                  }`}
                >
                  <span className="text-[10px]">{STATUS_ICONS[step.status] ?? '⬜'}</span>
                  <span className="flex-1 text-[var(--fg)]">{step.label}</span>
                  {step.badge && (
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${BADGE_COLORS[step.badge] ?? 'bg-[var(--border)]/30 text-[var(--muted)]'}`}>
                      {step.badge}
                    </span>
                  )}
                  {step.status === 'active' && (
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--muted)] border-t-transparent" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PanelCard>
  );
}

function SuggestionChip({ text }: { text: string }) {
  return (
    <div className="rounded border border-[var(--border)]/50 px-3 py-1.5 text-xs text-[var(--muted)]">
      💬 &ldquo;{text}&rdquo;
    </div>
  );
}

function PanelCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/50 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">{title}</h3>
      {children}
    </div>
  );
}