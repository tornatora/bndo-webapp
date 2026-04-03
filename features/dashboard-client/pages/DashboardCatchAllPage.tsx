import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { AtomicPageLoader } from '@/components/dashboard/AtomicPageLoader';
import { resolveDashboardInitialView } from '@/shared/config';

function firstQueryParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function loaderTargetFromView(
  view:
    | 'chat'
    | 'home'
    | 'form'
    | 'pratiche'
    | 'grantDetail'
    | 'choice'
    | 'quiz'
    | 'myPractices'
    | 'practiceDetail'
) {
  if (view === 'chat') return 'chat';
  if (view === 'home') return 'home';
  if (view === 'form') return 'scanner';
  if (view === 'pratiche' || view === 'myPractices') return 'pratiche';
  if (view === 'grantDetail') return 'bando';
  if (view === 'choice') return 'nuova pratica';
  if (view === 'quiz') return 'quiz';
  if (view === 'practiceDetail') return 'pratica';
  return 'pagina';
}

export default function DashboardCatchAllPage({ 
  params,
  searchParams
}: { 
  params: { slug?: string[] },
  searchParams: { grantId?: string | string[]; source?: string | string[]; mode?: string | string[] }
}) {
  if (!params.slug || params.slug.length === 0) {
    redirect('/dashboard/pratiche');
  }
  const grantId = firstQueryParam(searchParams.grantId);
  const source = firstQueryParam(searchParams.source);
  const mode = firstQueryParam(searchParams.mode);
  const slugRoot = params.slug?.[0];
  const baseInitialView = resolveDashboardInitialView(params.slug);
  let initialView:
    | 'chat'
    | 'home'
    | 'form'
    | 'pratiche'
    | 'grantDetail'
    | 'choice'
    | 'quiz'
    | 'myPractices'
    | 'practiceDetail' = baseInitialView;

  if (slugRoot === 'new-practice') {
    if (mode === 'scanner') initialView = 'form';
    if (mode === 'chat') initialView = 'chat';
    if (mode === 'detail' && grantId) initialView = 'grantDetail';
    if (mode === 'quiz' && grantId) initialView = 'quiz';
  }

  return (
    <main className="page-shell">
      <Suspense
        fallback={
          <AtomicPageLoader title="Sto caricando" targetWord={loaderTargetFromView(initialView)} />
        }
      >
        <ChatWindow 
          initialView={initialView} 
          initialGrantId={grantId}
          initialApplicationId={params.slug?.[0] === 'practices' ? params.slug[1] : undefined}
          initialSource={source as any}
          embedded={true}
        />
      </Suspense>
    </main>
  );
}
