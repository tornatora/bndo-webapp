'use client';

import Link from 'next/link';

type PracticeRef = { id: string; title: string };

function tabClass(active: boolean) {
  return `admin-mobile-tab ${active ? 'active' : ''}`;
}

export function AdminMobileTabs({
  companyId,
  activeTab,
  practices
}: {
  companyId: string;
  activeTab: 'info' | 'chat' | 'billing' | `practice:${string}`;
  practices: PracticeRef[];
}) {
  const selectedPracticeId = activeTab.startsWith('practice:') ? activeTab.split(':')[1] : null;
  const defaultPracticeId = selectedPracticeId ?? practices[0]?.id ?? null;

  return (
    <nav className="admin-mobile-tabs" aria-label="Navigazione admin mobile">
      <Link className={tabClass(false)} href="/admin">
        <span className="admin-mobile-tab-icon" aria-hidden="true">
          ←
        </span>
        <span className="admin-mobile-tab-label">Clienti</span>
      </Link>

      <Link className={tabClass(activeTab === 'info')} href={`/admin/clients/${companyId}?tab=info`}>
        <span className="admin-mobile-tab-icon" aria-hidden="true">
          i
        </span>
        <span className="admin-mobile-tab-label">Info</span>
      </Link>

      <Link
        className={tabClass(activeTab.startsWith('practice:'))}
        href={
          defaultPracticeId ? `/admin/clients/${companyId}?tab=practice:${defaultPracticeId}` : `/admin/clients/${companyId}?tab=info`
        }
        aria-disabled={!defaultPracticeId}
      >
        <span className="admin-mobile-tab-icon" aria-hidden="true">
          📋
        </span>
        <span className="admin-mobile-tab-label">Pratiche</span>
      </Link>

      <Link className={tabClass(activeTab === 'billing')} href={`/admin/clients/${companyId}?tab=billing`}>
        <span className="admin-mobile-tab-icon" aria-hidden="true">
          €
        </span>
        <span className="admin-mobile-tab-label">Pagamenti</span>
      </Link>

      <Link className={tabClass(activeTab === 'chat')} href={`/admin/clients/${companyId}?tab=chat`}>
        <span className="admin-mobile-tab-icon" aria-hidden="true">
          💬
        </span>
        <span className="admin-mobile-tab-label">Chat</span>
      </Link>
    </nav>
  );
}

