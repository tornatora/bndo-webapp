'use client';

import { BandiFormView } from '@/components/views/BandiFormView';

export function ScannerBandiProView({
  initialGrantId = null,
  onGrantSelect,
  onGrantDetail,
  embedded,
  guestMobileSafe = false
}: {
  initialGrantId?: string | null;
  onGrantSelect?: (grantId: string) => void;
  onGrantDetail?: (grantId: string) => void;
  embedded?: boolean;
  guestMobileSafe?: boolean;
}) {
  const shellClassName = guestMobileSafe ? 'scanner-pro-shell scanner-pro-shell-guest' : 'scanner-pro-shell';

  return (
    <main className={shellClassName}>
      <BandiFormView initialGrantId={initialGrantId} onGrantSelect={onGrantSelect} onGrantDetail={onGrantDetail} />
    </main>
  );
}
