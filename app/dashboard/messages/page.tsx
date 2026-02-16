import { redirect } from 'next/navigation';
import { requireUserProfile } from '@/lib/auth';
import { hasOpsAccess } from '@/lib/roles';
import { MessagesPageClient } from '@/components/dashboard/MessagesPageClient';

export default async function DashboardMessagesPage() {
  const { profile } = await requireUserProfile();

  if (hasOpsAccess(profile.role)) {
    redirect('/admin');
  }

  if (!profile.company_id) {
    return (
      <section className="welcome-section">
        <h1 className="welcome-title">Profilo non valido</h1>
        <p className="welcome-subtitle">Profilo non associato ad alcuna azienda. Contatta il supporto.</p>
      </section>
    );
  }

  return (
    <>
      <section className="welcome-section chat-hero">
        <h1 className="welcome-title">Messaggi</h1>
        <p className="welcome-subtitle">Chat diretta con il consulente. Risposta automatica immediata attiva.</p>
      </section>

      <MessagesPageClient viewerProfileId={profile.id} />
    </>
  );
}
