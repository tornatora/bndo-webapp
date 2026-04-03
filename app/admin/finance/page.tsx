import { requireOpsProfile } from '@/lib/auth';
import { AdminFinanceControl } from '@/components/admin/AdminFinanceControl';

export default async function AdminFinancePage() {
  await requireOpsProfile();
  return <AdminFinanceControl />;
}
