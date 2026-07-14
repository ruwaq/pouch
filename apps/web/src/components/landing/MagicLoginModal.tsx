'use client';

import { useState } from 'react';
import { useSession } from '../../context/session-context';
import { Button } from '../ui/Button';
import { ErrorMessage } from '../ui/ErrorMessage';
import { Spinner } from '../ui/Spinner';

export function MagicLoginModal({ onClose }: { onClose: () => void }) {
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    try {
      setStatus('checking'); // Magic email link sent — waiting for confirmation
      await login(email.trim());
      onClose();
    } catch {
      setError('Login failed. Check your email and try again.');
      setStatus('idle');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-[var(--fg)]">Connect to Pouch</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          No wallets, no popups. Just your email.
        </p>

        {status === 'checking' ? (
          <div className="mt-6 flex flex-col items-center gap-3 py-4">
            <Spinner />
            <p className="text-center text-sm text-[var(--muted)]">
              Check your email ({email}) and tap the Magic link to confirm.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-[var(--border)] bg-white/5 px-4 py-3 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
            />
            {error ? <ErrorMessage>{error}</ErrorMessage> : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">Send magic link</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
