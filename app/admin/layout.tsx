import Link from 'next/link';
import Image from 'next/image';
import { requireOpsProfile } from '@/lib/auth';
import { SignOutButton } from '@/components/dashboard/SignOutButton';
import { MARKETING_URL } from '@/lib/site-urls';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireOpsProfile();

  return (
    <div className="dashboard active">
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
          <div className="nav-actions">
            <div className="notification-bell" id="adminNotificationBell">
              <span>🔔</span>
              <span className="notification-count" id="ncount" style={{ display: 'none' }}>
                0
              </span>
            </div>
            <span className="nav-user" id="uname">
              {profile.full_name}
            </span>
            <SignOutButton className="btn-logout" compact />
          </div>
        </nav>
      </header>

      <main className="dashboard-content">{children}</main>
    </div>
  );
}
