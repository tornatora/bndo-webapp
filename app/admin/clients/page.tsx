import { ClientsList, type ClientListItem } from '@/components/admin/ClientsList';
import { createServerSupabaseClient, getOptionalUserProfile } from '@/shared/api';
import { hasAdminAccess } from '@/lib/roles';

export default async function AdminClientsPage() {
  try {
    if (process.env.MOCK_BACKEND !== 'true') {
      const bundle = await getOptionalUserProfile();
      if (!bundle || !hasAdminAccess(bundle.profile.role)) {
        return <ClientsFallback />;
      }
    }
  } catch (err) {
    console.error('[admin/clients] Auth error:', err);
    return <ClientsFallback />;
  }

  if (process.env.MOCK_BACKEND === 'true') {
    const { getMockClients } = await import('@/lib/mock/data');
    const clients: ClientListItem[] = getMockClients().map((client) => ({
      companyId: client.companyId,
      companyName: client.companyName,
      vatNumber: client.vatNumber,
      industry: client.industry,
      createdAt: client.createdAt,
      clientEmail: client.clientEmail,
      clientFullName: client.clientFullName,
    }));
    return <ClientsPage clients={clients} />;
  }

  let companies: any[] = [];
  let clientAdmins: any[] = [];
  try {
    const supabase = createServerSupabaseClient();
    const [cRes, pRes] = await Promise.all([
      supabase
        .from('companies')
        .select('id, name, vat_number, industry, created_at')
        .order('created_at', { ascending: false })
        .limit(250),
      supabase
        .from('profiles')
        .select('company_id, email, full_name, created_at')
        .in('company_id', [])
        .eq('role', 'client_admin')
        .order('created_at', { ascending: true })
        .limit(1000),
    ]);
    companies = cRes.data ?? [];
    clientAdmins = pRes.data ?? [];
  } catch (err) {
    console.error('[admin/clients] Query error:', err);
  }

  const companyIds = companies.map((c) => c.id);

  // Re-fetch client admins with real company IDs
  if (companyIds.length > 0) {
    try {
      const supabase = createServerSupabaseClient();
      const { data } = await supabase
        .from('profiles')
        .select('company_id, email, full_name, created_at')
        .in('company_id', companyIds)
        .eq('role', 'client_admin')
        .order('created_at', { ascending: true })
        .limit(1000);
      if (data) clientAdmins = data;
    } catch (err) {
      console.error('[admin/clients] Admin query error:', err);
    }
  }

  const adminByCompanyId = new Map<string, { email: string; full_name: string }>();
  for (const admin of clientAdmins) {
    if (!admin.company_id) continue;
    if (!adminByCompanyId.has(admin.company_id)) {
      adminByCompanyId.set(admin.company_id, { email: admin.email, full_name: admin.full_name });
    }
  }

  const clients: ClientListItem[] = companies.map((company) => {
    const ca = adminByCompanyId.get(company.id);
    return {
      companyId: company.id,
      companyName: company.name,
      vatNumber: company.vat_number,
      industry: company.industry,
      createdAt: company.created_at,
      clientEmail: ca?.email ?? null,
      clientFullName: ca?.full_name ?? null,
    };
  });

  return <ClientsPage clients={clients} />;
}

function ClientsFallback() {
  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: '#0B1136', margin: '0 0 4px' }}>Clienti</h1>
      <p style={{ fontSize: 13, color: 'rgba(11,17,54,0.5)' }}>Accesso non disponibile. Ricarica o riaccedi.</p>
    </div>
  );
}

function ClientsPage({ clients }: { clients: ClientListItem[] }) {
  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em', color: '#0B1136', margin: '0 0 4px' }}>
        Clienti
      </h1>
      <p style={{ fontSize: 12, color: 'rgba(11,17,54,0.5)', margin: '0 0 24px' }}>
        Elenco di tutte le aziende registrate in piattaforma.
      </p>
      {clients.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'rgba(11,17,54,0.4)', fontSize: 13 }}>
          Nessun cliente presente.
        </div>
      ) : (
        <ClientsList initialClients={clients} />
      )}
    </div>
  );
}
