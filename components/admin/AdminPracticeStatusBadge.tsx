'use client';

import { useEffect, useMemo, useState } from 'react';
import { progressBadge, type ProgressStepKey } from '@/lib/admin/practice-progress';

type Props = {
  applicationId: string;
  initialStep: ProgressStepKey;
};

export function AdminPracticeStatusBadge({ applicationId, initialStep }: Props) {
  const [step, setStep] = useState<ProgressStepKey>(initialStep);

  const badge = useMemo(() => progressBadge(step), [step]);

  useEffect(() => {
    function onUpdate(ev: Event) {
      const detail = (ev as CustomEvent<{ applicationId: string; step: ProgressStepKey }>).detail;
      if (!detail) return;
      if (detail.applicationId !== applicationId) return;
      setStep(detail.step);
    }

    document.addEventListener('bndo:practice-progress', onUpdate as EventListener);
    return () => document.removeEventListener('bndo:practice-progress', onUpdate as EventListener);
  }, [applicationId]);

  useEffect(() => {
    setStep(initialStep);
  }, [initialStep]);

  return <span className={badge.className}>{badge.label}</span>;
}

