import { redirect } from 'next/navigation';
import { requireUserProfile } from '@/lib/auth';
import { hasOpsAccess } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';
import { ProfileSettings } from '@/components/dashboard/ProfileSettings';

export default async function DashboardProfilePage() {
  const { profile } = await requireUserProfile();

  if (hasOpsAccess(profile.role)) {
    redirect('/admin');
  }

  const supabase = createClient();

  const { data: company } = profile.company_id
    ? await supabase
        .from('companies')
        .select('name, vat_number, industry, annual_spend_target')
        .eq('id', profile.company_id)
        .maybeSingle()
    : { data: null };

  const normalizedVat = (company?.vat_number ?? '').trim();
  const isVatNumber = /^[a-zA-Z]{0,2}[0-9]{11}$/.test(normalizedVat.replace(/\s+/g, ''));
  const billingType: 'company' | 'individual' = normalizedVat && !isVatNumber ? 'individual' : 'company';

  return (
    <>
      <section className="welcome-section">
        <h1 className="welcome-title">Profilo</h1>
        <p className="welcome-subtitle">Gestisci dati account, fatturazione e sicurezza in un unico spazio.</p>
      </section>

      <ProfileSettings
        initialProfile={{
          fullName: profile.full_name,
          username: profile.username,
          email: profile.email
        }}
        initialCompany={
          company
            ? {
                name: company.name,
                vatNumber: company.vat_number,
                industry: company.industry,
                annualSpendTarget: company.annual_spend_target,
                billingType
              }
            : null
        }
      />
    </>
  );
}
