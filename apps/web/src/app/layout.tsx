import type { Metadata } from 'next';
import './globals.css';
import type { ReactNode } from 'react';
import { SessionProvider } from '../context/session-context';

export const metadata: Metadata = {
  title: 'Pouch — AI Crypto Cash-Out Agent',
  description:
    'Talk to your money. Pouch converts your crypto into gift cards, mobile top-ups, eSIM, and bank transfers — without wallets, gas, chains, or signing popups.',
  openGraph: {
    title: 'Pouch — AI Crypto Cash-Out Agent',
    description:
      'Talk to your money. It cashes out anywhere. Crypto to real-world value in one conversation.',
    siteName: 'Pouch',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Pouch — AI Crypto Cash-Out Agent',
    description:
      'Talk to your money. It cashes out anywhere. Crypto to real-world value in one conversation.',
  },
  robots: 'index, follow',
  icons: {
    icon: '/images/circular_logo.jpg',
    apple: '/images/circular_logo.jpg',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}