import { CompilaBandoPage } from '@/features/compila-bando';
import type { WizardStep } from '@/features/compila-bando/lib/types';

export const dynamic = 'force-dynamic';

const ALLOWED_STEPS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

export default function CompilaBandoPreviewRoute({
  searchParams,
}: {
  searchParams?: { step?: string };
}) {
  const rawStep = Number(searchParams?.step ?? 7);
  const initialStep = (ALLOWED_STEPS.has(rawStep) ? rawStep : 7) as WizardStep;

  return <CompilaBandoPage initialStep={initialStep} />;
}
