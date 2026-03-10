import Image from 'next/image';
import Link from 'next/link';
import { AdminNotificationsBell } from '@/components/admin/AdminNotificationsBell';
import { SignOutButton } from '@/components/dashboard/SignOutButton';
import { requireOpsProfile } from '@/shared/api';
import { MARKETING_URL } from '@/shared/lib';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const isMock = process.env.MOCK_BACKEND === 'true';
  const profile = isMock ? { full_name: 'Admin (Mock)' } : (await requireOpsProfile()).profile;

  return (
    <div className="dashboard active admin-dashboard">
      <header className="dashboard-header">
        <nav className="dashboard-nav">
          <div className="nav-brand-admin">
            <Link href={MARKETING_URL} aria-label="Vai alla home BNDO" className="nav-brand">
              <Image
                src="/Logo-BNDO-header.png"
                alt="BNDO"
                width={210}
                height={60}
                className="nav-brand-logo"
                priority
              />
            </Link>
            <span className="nav-brand-chip">Admin</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Link href="/admin" style={{ padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, color: '#0B1136', textDecoration: 'none', background: '#F1F5F9' }}>
              👥 Clienti
            </Link>
            <Link href="/admin/quiz-responses" style={{ padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, color: '#0B1136', textDecoration: 'none', background: '#F1F5F9' }}>
              🧩 Risposte Quiz
            </Link>
          </div>
          <div className="nav-actions">
            <AdminNotificationsBell />
            <span className="nav-user" id="uname">
              {profile.full_name}
            </span>
            {isMock ? null : <SignOutButton className="btn-logout" compact />}
          </div>
        </nav>
      </header>

      <main className="dashboard-content admin-dashboard-content">{children}</main>
    </div>
  );
}
