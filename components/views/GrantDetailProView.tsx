'use client';

import { GrantDetailInlinePro } from '@/components/views/GrantDetailInlinePro';

export function GrantDetailProView({ grantId }: { grantId: string }) {
  return (
    <main className="w-full px-4 pb-10 md:px-8">
      <GrantDetailInlinePro grantId={grantId} />
    </main>
  );
}
