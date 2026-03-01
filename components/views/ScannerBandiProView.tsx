'use client';

import { BandiFormView } from '@/components/views/BandiFormView';

export function ScannerBandiProView({ initialGrantId = null }: { initialGrantId?: string | null }) {
  return (
    <main className="w-full px-4 pb-10 md:px-8">
      <BandiFormView initialGrantId={initialGrantId} />
    </main>
  );
}
