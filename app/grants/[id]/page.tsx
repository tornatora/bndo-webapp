import { ChatWindow } from '@/components/chat/ChatWindow';

export default function GrantDetailPage({ params }: { params: { id: string } }) {
  return (
    <main className="page-shell">
      <ChatWindow initialView="grantDetail" initialGrantId={params.id} />
    </main>
  );
}
