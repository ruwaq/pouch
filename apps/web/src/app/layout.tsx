import './globals.css';
import type { ReactNode } from 'react';
import { SessionProvider } from '../context/session-context';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
