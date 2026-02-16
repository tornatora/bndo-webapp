import Link from 'next/link';
import Image from 'next/image';
import { requireUserProfile } from '@/lib/auth';
import { SignOutButton } from '@/components/dashboard/SignOutButton';
import { DashboardTabs } from '@/components/dashboard/DashboardTabs';
import { NotificationsBell } from '@/components/dashboard/NotificationsBell';
import { MARKETING_URL } from '@/lib/site-urls';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUserProfile();

  return (
    <div className="dashboard active">
      <header className="dashboard-header">
        <nav className="dashboard-nav">
          <Link href={MARKETING_URL} className="nav-brand" aria-label="Vai alla home BNDO">
            <Image
              src="/Logo-BNDO-header.png"
              alt="BNDO"
              width={210}
              height={60}
              className="nav-brand-logo"
              priority
            />
          </Link>
          <div className="nav-actions">
            <NotificationsBell viewerProfileId={profile.id} />
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
