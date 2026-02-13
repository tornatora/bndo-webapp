import Link from 'next/link';
import Image from 'next/image';
import { requireUserProfile } from '@/lib/auth';
import { SignOutButton } from '@/components/dashboard/SignOutButton';
import { DashboardTabs } from '@/components/dashboard/DashboardTabs';
import { NotificationsBell } from '@/components/dashboard/NotificationsBell';
import { MARKETING_URL } from '@/lib/site-urls';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUserProfile();
  const supabase = createClient();

  let threadId: string | null = null;
  if (profile.company_id) {
    const { data: existingThread } = await supabase
      .from('consultant_threads')
      .select('id')
      .eq('company_id', profile.company_id)
      .maybeSingle();
    threadId = existingThread?.id ?? null;

    if (!threadId) {
      const { data: createdThread } = await supabase
        .from('consultant_threads')
        .insert({ company_id: profile.company_id })
        .select('id')
        .single();
      threadId = createdThread?.id ?? null;
    }
  }

  const { data: participant } = threadId
    ? await supabase
        .from('consultant_thread_participants')
        .select('last_read_at')
        .eq('thread_id', threadId)
        .eq('profile_id', profile.id)
        .maybeSingle()
    : { data: null };

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
            <NotificationsBell threadId={threadId} viewerProfileId={profile.id} initialLastReadAt={participant?.last_read_at ?? null} />
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
