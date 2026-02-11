import Link from 'next/link';
import { requireUserProfile } from '@/lib/auth';
import { SignOutButton } from '@/components/dashboard/SignOutButton';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUserProfile();

  return (
    <div className="dashboard active">
      <header className="dashboard-header">
        <nav className="dashboard-nav">
          <div className="nav-brand">
            <span>🎯 BNDO</span>
          </div>
          <div className="nav-actions">
            <span className="nav-user">@{profile.username}</span>
            <SignOutButton className="btn-logout" compact />
          </div>
        </nav>
      </header>

      <nav className="main-tabs">
        <div className="main-tabs-container">
          <Link className="main-tab active" href="/dashboard#pratiche">
            <span>📋</span>
            <span>Pratiche</span>
          </Link>
          <Link className="main-tab" href="/dashboard#documenti">
            <span>📄</span>
            <span>Documenti</span>
          </Link>
          <Link className="main-tab" href="/dashboard#messaggi">
            <span>💬</span>
            <span>Messaggi</span>
          </Link>
        </div>
      </nav>

      <main className="dashboard-content">{children}</main>
    </div>
  );
}
