import { NotificationsTimelineClient } from '@/components/notifications/NotificationsTimelineClient';
import { requireConsultantProfile } from '@/lib/auth';

export default async function ConsultantNotificationsPage() {
  await requireConsultantProfile();

  return (
    <NotificationsTimelineClient
      title="Notifiche consulente"
      subtitle="Eventi pratiche assegnate, documenti, pagamenti e chat"
      defaultActionPath="/consultant/practices"
    />
  );
}
