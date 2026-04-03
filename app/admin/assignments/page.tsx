import { requireOpsProfile } from '@/lib/auth';
import { AdminAssignmentsClient } from '@/components/admin/AdminAssignmentsClient';

export default async function AdminAssignmentsPage() {
  await requireOpsProfile();
  return <AdminAssignmentsClient />;
}
