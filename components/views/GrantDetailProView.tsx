'use client';

import { GrantDetailInlinePro } from '@/components/views/GrantDetailInlinePro';

export function GrantDetailProView({
  grantId,
  sourceChannel = 'direct'
}: {
  grantId: string;
  sourceChannel?: 'scanner' | 'chat' | 'direct' | 'admin';
}) {
  return (
    <main className="w-full px-4 pb-10 md:px-8">
      <GrantDetailInlinePro grantId={grantId} sourceChannel={sourceChannel} />
    </main>
  );
}
