import Image from 'next/image';
import Link from 'next/link';
import { requireUserProfile } from '@/lib/auth';
import { SignOutButton } from '@/components/dashboard/SignOutButton';
import { DashboardTabs } from '@/components/dashboard/DashboardTabs';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUserProfile();

  return (
    <div className="dashboard active">
      <header className="dashboard-header">
        <nav className="dashboard-nav">
          <Link href="/" className="nav-brand" aria-label="Vai alla home BNDO">
            <Image src="/Logo-BNDO.png" alt="BNDO" width={138} height={30} className="nav-brand-logo" priority />
          </Link>
          <div className="nav-actions">
            <div className="notification-bell" id="notificationBell">
              <span>🔔</span>
              <span className="notification-count" id="notificationCount" style={{ display: 'none' }}>
                0
              </span>
            </div>
            <span className="nav-user" id="userName">
              @{profile.username}
            </span>
            <SignOutButton className="btn-logout" compact />
          </div>
        </nav>
      </header>

      <div className="dashboard-shell-client">
        <aside className="dashboard-sidebar-client">
          <DashboardTabs />
        </aside>
        <main className="dashboard-content dashboard-content-client">{children}</main>
      </div>
    </div>
  );
}
