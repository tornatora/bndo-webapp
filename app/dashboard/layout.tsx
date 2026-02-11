import Link from 'next/link';
import { Building2, MessageCircle, SearchCheck, Settings2 } from 'lucide-react';
import { requireUserProfile } from '@/lib/auth';
import { hasOpsAccess } from '@/lib/roles';
import { SignOutButton } from '@/components/dashboard/SignOutButton';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUserProfile();

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
      <div className="desktop-grid grid gap-5 lg:grid-cols-[260px_1fr]">
        <aside className="panel h-fit p-4 sm:p-5">
          <div className="rounded-xl bg-brand.navy p-3 text-white">
            <p className="text-xs uppercase tracking-wide text-slate-200">Cliente</p>
            <p className="mt-1 text-base font-bold">{profile.full_name}</p>
            <p className="text-sm text-slate-200">@{profile.username}</p>
          </div>

          <nav className="mt-5 space-y-2">
            <Link href="/dashboard" className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-slate-50">
              <SearchCheck className="h-4 w-4 text-brand.steel" />
              Gare consigliate
            </Link>
            <Link
              href="/dashboard#chat"
              className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-slate-50"
            >
              <MessageCircle className="h-4 w-4 text-brand.steel" />
              Chat consulente
            </Link>
            {hasOpsAccess(profile.role) ? (
              <Link href="/admin" className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-slate-50">
                <Settings2 className="h-4 w-4 text-brand.steel" />
                Pannello admin
              </Link>
            ) : null}
            <a href="#" className="flex items-center gap-2 rounded-xl px-3 py-2 text-slate-400">
              <Building2 className="h-4 w-4" />
              Albo fornitori
            </a>
            <a href="#" className="flex items-center gap-2 rounded-xl px-3 py-2 text-slate-400">
              <Settings2 className="h-4 w-4" />
              Impostazioni
            </a>
          </nav>

          <div className="mt-6">
            <SignOutButton />
          </div>
        </aside>

        <section>{children}</section>
      </div>
    </main>
  );
}
