'use client';

import { useState } from 'react';
import { useSession } from '../../context/session-context';
import { Button } from '../ui/Button';
import { MagicLoginModal } from './MagicLoginModal';

const highlights = [
  'Natural language cash-out flow',
  'Cross-chain consolidation via Universal Accounts',
  'Provider routing across gift cards, top-ups, and eSIMs',
];

export function Landing() {
  const [showLogin, setShowLogin] = useState(false);
  const { demoLogin, loading } = useSession();

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center px-6 text-center">
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
        Pouch
      </span>
      <h1 className="mt-4 text-balance text-4xl font-extrabold leading-tight text-[var(--fg)] sm:text-5xl">
        Talk to your money. It cashes out anywhere.
      </h1>
      <p className="mt-4 max-w-xl text-balance text-[var(--muted-2)]">
        Say how much and where. Pouch converts your crypto into gift cards, top-ups, and more — invisibly.
      </p>

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <Button onClick={() => void demoLogin()} disabled={loading}>
          {loading ? 'Entering…' : 'Try Demo'}
        </Button>
        <span className="text-xs text-[var(--muted)]">or</span>
        <Button variant="ghost" onClick={() => setShowLogin(true)}>
          Connect wallet
        </Button>
      </div>

      <ul className="mt-12 grid w-full gap-3 text-left sm:grid-cols-3">
        {highlights.map((h) => (
          <li
            key={h}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm text-[var(--muted-2)]"
          >
            {h}
          </li>
        ))}
      </ul>

      {showLogin ? <MagicLoginModal onClose={() => setShowLogin(false)} /> : null}
    </main>
  );
}
