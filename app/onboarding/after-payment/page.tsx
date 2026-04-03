import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function LegacyAfterPaymentPage({
  searchParams
}: {
  searchParams: { session_id?: string; bando?: string; practice?: string; pratica?: string; quiz?: string };
}) {
  const params = new URLSearchParams();
  if (searchParams.session_id) params.set('session_id', searchParams.session_id);
  if (searchParams.bando) params.set('bando', searchParams.bando);
  if (searchParams.practice) params.set('practice', searchParams.practice);
  if (searchParams.pratica) params.set('pratica', searchParams.pratica);
  if (searchParams.quiz) params.set('quiz', searchParams.quiz);
  const query = params.toString();
  redirect(query ? `/onboarding?${query}` : '/onboarding');
}
