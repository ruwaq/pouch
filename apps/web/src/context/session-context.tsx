'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiPost, demoLogin as apiDemoLogin } from '../lib/api-client';
import {
  getEvmAddress,
  hasMagicConfig,
  isLoggedIn,
  loginWithEmail,
  logout as magicLogout,
} from '../lib/magic-client';

export interface Session {
  userId: string;
  evmAddress: string;
}

export type SessionStatus = 'loading' | 'anonymous' | 'authenticated';

interface SessionContextValue {
  status: SessionStatus;
  session: Session | null;
  login: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  /** One-click demo login — no email required. */
  demoLogin: () => Promise<void>;
  loading: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

// Exported for testing (pure, no React).
export async function authenticateWithDid(didToken: string): Promise<Session> {
  return apiPost<Session>('/auth/callback', { didToken });
}

export async function signOut(): Promise<void> {
  await magicLogout();
  await apiPost<{ ok: boolean }>('/auth/logout', null);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);

  // On mount: if a Magic session already exists, read its EVM address.
  // We do NOT re-mint the cookie here — the httpOnly pouch_session cookie
  // persists server-side for 7 days. Only read the address from Magic.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasMagicConfig()) {
        if (!cancelled) setStatus('anonymous');
        return;
      }
      try {
        const loggedIn = await isLoggedIn();
        if (!loggedIn) {
          if (!cancelled) setStatus('anonymous');
          return;
        }
        const evmAddress = await getEvmAddress();
        if (!cancelled) {
          setSession({ userId: evmAddress, evmAddress });
          setStatus('authenticated');
        }
      } catch {
        if (!cancelled) setStatus('anonymous');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string) => {
    const did = await loginWithEmail(email);
    const next = await authenticateWithDid(did);
    setSession(next);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await signOut();
    setSession(null);
    setStatus('anonymous');
  }, []);

  const demoLogin = useCallback(async () => {
    setLoading(true);
    try {
      const next = await apiDemoLogin();
      setSession(next);
      setStatus('authenticated');
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ status, session, login, logout, demoLogin, loading }),
    [status, session, login, logout, demoLogin, loading],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within <SessionProvider>');
  return ctx;
}
