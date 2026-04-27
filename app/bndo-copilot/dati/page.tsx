import { redirect } from 'next/navigation';
import { requireUserProfile } from '@/lib/auth';

export const runtime = 'nodejs';

export default async function BndoCopilotDataPage() {
  await requireUserProfile();
  redirect('/dashboard/pratiche');
}
