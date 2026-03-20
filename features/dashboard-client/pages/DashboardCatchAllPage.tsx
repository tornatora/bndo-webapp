import { Suspense } from 'react';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { resolveDashboardInitialView } from '@/shared/config';

export default function DashboardCatchAllPage({ params }: { params: { slug?: string[] } }) {
  return (
    <main className="page-shell">
      <Suspense fallback={<div className="loading-shell">Caricamento…</div>}>
        <ChatWindow initialView={resolveDashboardInitialView(params.slug)} />
      </Suspense>
    </main>
  );
}
