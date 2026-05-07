import { Suspense } from 'react';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { BndoAdvisorChat } from '@/components/chat/BndoAdvisorChat';

export default function MarketingHomePage() {
  const chatkitEnabled = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.NEXT_PUBLIC_ENABLE_BNDO_CHAT ?? '').trim().toLowerCase()
  );

  return (
    <main className="page-shell">
      <Suspense fallback={null}>
        {chatkitEnabled ? (
          <div className="bndo-shell">
            <BndoAdvisorChat
              sourcePage="/"
              bandoContext="unknown"
              className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6"
              title="BNDO Advisor"
              subtitle="Consulenza guidata su Resto al Sud 2.0 e Autoimpiego Centro-Nord."
            />
          </div>
        ) : (
          <ChatWindow />
        )}
      </Suspense>
    </main>
  );
}
