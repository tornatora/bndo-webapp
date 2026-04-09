import { NotificationsTimelineClient } from '@/components/notifications/NotificationsTimelineClient';
import { requireOpsProfile } from '@/lib/auth';

export default async function AdminNotificationsPage() {
  await requireOpsProfile();

  return (
    <NotificationsTimelineClient
      title="Notifiche admin"
      subtitle="Timeline completa piattaforma (lead, pratiche, documenti, pagamenti, consulenti)"
      defaultActionPath="/admin"
    />
  );
}
