'use client';

import { Landing } from '../components/landing/Landing';
import { ChatView } from '../components/chat/ChatView';
import { useSession } from '../context/session-context';
import { Spinner } from '../components/ui/Spinner';

export default function Home() {
  const { status } = useSession();

  if (status === 'loading') {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Spinner label="Loading…" />
      </main>
    );
  }

  if (status === 'anonymous') {
    return <Landing />;
  }

  return <ChatView />;
}
