import { requireOpsProfile } from '@/lib/auth';
import { AdminAuditTrailClient } from '@/components/admin/AdminAuditTrailClient';

export default async function AdminAuditPage() {
  await requireOpsProfile();
  return <AdminAuditTrailClient />;
}
