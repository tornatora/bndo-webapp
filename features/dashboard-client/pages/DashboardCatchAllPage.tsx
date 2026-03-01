import { ChatWindow } from '@/components/chat/ChatWindow';
import { resolveDashboardInitialView } from '@/shared/config';

export default function DashboardCatchAllPage({ params }: { params: { slug?: string[] } }) {
  return (
    <main className="page-shell">
      <ChatWindow initialView={resolveDashboardInitialView(params.slug)} />
    </main>
  );
}
