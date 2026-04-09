import { redirect } from 'next/navigation';
import { NotificationsTimelineClient } from '@/components/notifications/NotificationsTimelineClient';
import { requireUserProfile } from '@/lib/auth';

export default async function DashboardNotificationsPage() {
  const { profile } = await requireUserProfile();

  if (profile.role === 'ops_admin') {
    redirect('/admin/notifications');
  }
  if (profile.role === 'consultant') {
    redirect('/consultant/notifications');
  }

  return (
    <NotificationsTimelineClient
      title="Notifiche cliente"
      subtitle="Timeline operativa della tua pratica"
      defaultActionPath="/dashboard/pratiche"
    />
  );
}
