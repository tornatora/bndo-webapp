import { requireOpsOrConsultantProfile } from '@/lib/auth';
import { ConsultantPracticesClient } from '@/components/consultant/ConsultantPracticesClient';

export default async function ConsultantDashboardPage() {
  await requireOpsOrConsultantProfile();
  return <ConsultantPracticesClient />;
}
