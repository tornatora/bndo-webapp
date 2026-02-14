import type { Metadata } from 'next';
import './globals.css';
import { CookieBanner } from '@/components/legal/CookieBanner';

export const metadata: Metadata = {
  title: 'BNDO | Web app bandi e pratiche',
  description:
    'Piattaforma web completa per verifica requisiti, gestione pratiche, chat cliente-consulente e pannello admin in tempo reale.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
