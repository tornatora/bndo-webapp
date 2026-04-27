import { redirect } from 'next/navigation';
import { requireUserProfile } from '@/lib/auth';
import { hasAdminAccess, hasConsultantAccess } from '@/lib/roles';
import { MessagesPageClient } from '@/components/dashboard/MessagesPageClient';

export default async function DashboardMessagesPage() {
  const { profile } = await requireUserProfile();

  if (hasAdminAccess(profile.role)) {
    redirect('/admin');
  }
  if (hasConsultantAccess(profile.role)) {
    redirect('/consultant');
  }

  if (!profile.company_id) {
    return (
      <section className="welcome-section">
        <h1 className="welcome-title">Profilo non valido</h1>
        <p className="welcome-subtitle">Profilo non associato ad alcuna azienda. Contatta il supporto.</p>
      </section>
    );
  }

  return <MessagesPageClient viewerProfileId={profile.id} />;
}
