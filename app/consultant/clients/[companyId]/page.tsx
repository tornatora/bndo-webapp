import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ConsultantClientPracticesPanel } from '@/components/consultant/ConsultantClientPracticesPanel';
import { requireOpsOrConsultantProfile } from '@/lib/auth';

const ParamsSchema = z.object({
  companyId: z.string().uuid()
});

export default async function ConsultantClientDetailPage({
  params
}: {
  params: { companyId: string };
}) {
  const parsedParams = ParamsSchema.safeParse(params);
  if (!parsedParams.success) notFound();

  await requireOpsOrConsultantProfile();

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Link href="/consultant" className="back-button">
        ← Torna alla panoramica consulente
      </Link>
      <ConsultantClientPracticesPanel companyId={parsedParams.data.companyId} />
    </div>
  );
}
