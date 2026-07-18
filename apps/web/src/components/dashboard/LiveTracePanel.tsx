'use client';

import { useChat } from '../../context/chat-context';

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

  // Collect all traces from all agent messages
  const allTraces = messages
    .filter((m) => m.role === 'agent' && m.response?.trace?.length)
    .flatMap((m, msgIdx) =>
      (m.response!.trace ?? []).map((step, stepIdx) => ({
        ...step,
        _msgIdx: msgIdx,
        _stepIdx: stepIdx,
        _intent: m.response!.intent,
        _phase: m.response!.phase,
        _security: m.response!.securityVerdict,
        _reply: m.response!.reply?.slice(0, 80),
      }))
    );

  if (allTraces.length === 0) {
    return (
      <PanelCard title="🔍 Live Trace">
        <p className="text-xs text-[var(--muted)]">
          Send a message to see the execution trace appear here in real-time.
        </p>
        <div className="mt-3 space-y-2">
          <SuggestionChip text="Show my balance" />
          <SuggestionChip text="What is EIP-7702?" />
          <SuggestionChip text="Cash out $10 to Amazon" />
        </div>
      </PanelCard>
    );
  }

  // Get the latest intent info
  const lastAgent = [...messages].reverse().find((m) => m.role === 'agent');
  const intent = lastAgent?.response?.intent;
  const phase = lastAgent?.response?.phase;
  const securityVerdict = lastAgent?.response?.securityVerdict;

  return (
    <PanelCard title={`🔍 Live Trace (${allTraces.length} step${allTraces.length > 1 ? 's' : ''})`}>
      <div className="space-y-3">
        {/* Intent + Phase */}
        <div className="flex flex-wrap items-center gap-2">
          {intent && (
            <span className="rounded bg-[var(--accent)]/15 px-2 py-0.5 text-xs font-medium text-[var(--accent)]">
              {intent.action}
            </span>
          )}
          {intent?.amount?.value != null && intent.amount.value > 0 && (
            <span className="text-xs text-[var(--fg)]">${intent.amount.value.toFixed(2)}</span>
          )}
          {intent?.brand && (
            <span className="text-xs text-[var(--muted)]">→ {intent.brand}</span>
          )}
          {phase && (
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${
              phase === 'confirmation' ? 'bg-amber-400/15 text-amber-300' :
              phase === 'executed' ? 'bg-emerald-400/15 text-emerald-300' :
              'bg-[var(--border)]/50 text-[var(--muted)]'
            }`}>
              {phase}
            </span>
          )}
        </div>

        {/* Security verdict */}
        {securityVerdict && (
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
            securityVerdict.verdict === 'BLOCK' ? 'bg-red-400/10 text-red-300' :
            securityVerdict.verdict === 'WARN' ? 'bg-amber-400/10 text-amber-300' :
            'bg-emerald-400/10 text-emerald-300'
          }`}>
            <span>🛡️ {securityVerdict.verdict}</span>
            {securityVerdict.riskScore !== undefined && (
              <span className="text-[var(--muted)]">risk {securityVerdict.riskScore}/100</span>
            )}
          </div>
        )}

        {/* Trace steps */}
        <div className="space-y-1">
          {allTraces.map((step, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 rounded border px-3 py-2 text-xs transition-all ${
                step.status === 'active' ? 'border-[var(--accent)]/50 bg-[var(--accent)]/5' :
                step.status === 'complete' ? 'border-[var(--border)]/50 bg-[var(--bg)]' :
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