import { Suspense } from 'react';
import { ChatWindow } from '@/components/chat/ChatWindow';

export default function MarketingHomePage() {
  return (
    <main className="page-shell">
      <Suspense fallback={null}>
        <ChatWindow />
      </Suspense>
    </main>
  );
}
