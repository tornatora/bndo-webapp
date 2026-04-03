'use client';

import { GrantDetailInlinePro } from '@/components/views/GrantDetailInlinePro';

export function GrantDetailProView({
  grantId,
  sourceChannel = 'direct',
  onVerify,
  onBack
}: {
  grantId: string;
  sourceChannel?: 'scanner' | 'chat' | 'direct' | 'admin';
  onVerify?: (grantId: string) => void;
  onBack?: () => void;
}) {
  return (
    <main className="w-full px-4 pb-10 md:px-8">
      <GrantDetailInlinePro 
        grantId={grantId} 
        sourceChannel={sourceChannel} 
        onVerify={onVerify}
        onBack={onBack}
      />
    </main>
  );
}
