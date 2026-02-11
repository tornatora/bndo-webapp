import { requireOpsProfile } from '@/lib/auth';
import { SignOutButton } from '@/components/dashboard/SignOutButton';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireOpsProfile();

  return (
    <div className="dashboard active">
      <header className="dashboard-header">
        <nav className="dashboard-nav">
          <div className="nav-brand">
            <span>⚙️ BNDO Admin</span>
          </div>
          <div className="nav-actions">
            <span className="nav-user">{profile.full_name}</span>
            <SignOutButton className="btn-logout" compact />
          </div>
        </nav>
      </header>

      <main className="dashboard-content">{children}</main>
    </div>
  );
}
