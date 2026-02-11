import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BNDO | Web app bandi e pratiche',
  description:
    'Piattaforma web completa per verifica requisiti, gestione pratiche, chat cliente-consulente e pannello admin in tempo reale.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
