'use client';

import { Landing } from '../components/landing/Landing';
import { ChatView } from '../components/chat/ChatView';
import { useSession } from '../context/session-context';
import { Spinner } from '../components/ui/Spinner';

export default function Home() {
  const { status } = useSession();
  const hasMagic = Boolean(process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY);

  if (status === 'loading') {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Spinner label="Loading…" />
      </main>
    );
  }

  // No Magic key configured → skip the landing/login gate and show the chat
  // directly against the API's demo mode (balances + orders are simulated).
  if (status === 'anonymous' && hasMagic) {
    return <Landing />;
  }

  return <ChatView />;
}
