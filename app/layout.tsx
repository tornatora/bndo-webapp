import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'BNDO | Web app bandi e pratiche',
  description: 'Piattaforma web completa per verifica requisiti, gestione pratiche, chat cliente-consulente e pannello admin in tempo reale.'
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fc' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1136' }
  ]
};

import { CookieBanner } from '@/components/ui/CookieBanner';
import { ClientTelemetry } from '@/components/system/ClientTelemetry';
import { ViewportSync } from '@/components/system/ViewportSync';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="antialiased">
        <ViewportSync />
        <Suspense fallback={null}>
          <ClientTelemetry />
        </Suspense>
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
