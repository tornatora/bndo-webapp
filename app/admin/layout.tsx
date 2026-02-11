import Link from 'next/link';
import { Building2, Home, LayoutDashboard } from 'lucide-react';
import type { ReactNode } from 'react';
import { requireOpsProfile } from '@/lib/auth';
import { SignOutButton } from '@/components/dashboard/SignOutButton';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { profile } = await requireOpsProfile();

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
      <section className="panel mb-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand.steel">Area Operativa</p>
            <h1 className="text-2xl font-extrabold text-brand.navy">Admin BNDO</h1>
            <p className="text-sm text-slate-600">
              {profile.full_name} - ruolo {profile.role}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/" className="btn btn-muted text-sm">
              <Home className="h-4 w-4" />
              Sito
            </Link>
            <Link href="/dashboard" className="btn btn-muted text-sm">
              <LayoutDashboard className="h-4 w-4" />
              Dashboard cliente
            </Link>
            <a href="#inbox" className="btn btn-muted text-sm">
              <Building2 className="h-4 w-4" />
              Inbox
            </a>
            <SignOutButton />
          </div>
        </div>
      </section>

      <section id="inbox">{children}</section>
    </main>
  );
}
