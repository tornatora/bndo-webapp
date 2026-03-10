import { requireOpsProfile } from '@/shared/api';
import { AdminQuizResponsesClient } from '@/components/admin/AdminQuizResponsesClient';

export default async function AdminQuizResponsesPage() {
  const isMock = process.env.MOCK_BACKEND === 'true';
  if (!isMock) {
    await requireOpsProfile();
  }

  return <AdminQuizResponsesClient />;
}
