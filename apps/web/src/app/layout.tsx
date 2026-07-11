import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: 'Inter, system-ui, sans-serif',
          background: '#0b1020',
          color: '#f5f7ff',
        }}
      >
        {children}
      </body>
    </html>
  );
}
