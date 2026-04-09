import { requireOpsOrConsultantProfile } from '@/lib/auth';
import { ConsultantBillingPaymentsClient } from '@/components/consultant/ConsultantBillingPaymentsClient';

export default async function ConsultantBillingPage() {
  await requireOpsOrConsultantProfile();
  return <ConsultantBillingPaymentsClient />;
}
