import { requireOpsProfile } from '@/lib/auth';
import { AdminAnalyticsControl } from '@/components/admin/AdminAnalyticsControl';

export default async function AdminAnalyticsPage() {
  await requireOpsProfile();
  return <AdminAnalyticsControl />;
}
