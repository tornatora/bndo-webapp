'use client';

import { BandiFormView } from '@/components/views/BandiFormView';

export function ScannerBandiProView({
  initialGrantId = null,
  onGrantSelect,
  onGrantDetail
}: {
  initialGrantId?: string | null;
  onGrantSelect?: (grantId: string) => void;
  onGrantDetail?: (grantId: string) => void;
}) {
  return (
    <main className="w-full px-4 pb-10 md:px-8">
      <BandiFormView initialGrantId={initialGrantId} onGrantSelect={onGrantSelect} onGrantDetail={onGrantDetail} />
    </main>
  );
}
