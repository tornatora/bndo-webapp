import { ClientsList, type ClientListItem } from '@/components/admin/ClientsList';
import { requireOpsProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getMockClients } from '@/lib/mock/data';

export default async function AdminPage() {
  const isMock = process.env.MOCK_BACKEND === 'true';
  if (!isMock) {
    await requireOpsProfile();
  }

  if (isMock) {
    const clients: ClientListItem[] = getMockClients().map((client) => ({
      companyId: client.companyId,
      companyName: client.companyName,
      vatNumber: client.vatNumber,
      industry: client.industry,
      createdAt: client.createdAt,
      clientEmail: client.clientEmail,
      clientFullName: client.clientFullName
    }));

    return (
      <section className="section-card">
        <div className="section-title">
          <span>👥</span>
          <span>Clienti (Mock)</span>
        </div>
        <ClientsList initialClients={clients} />
      </section>
    );
  }

  const supabase = createClient();

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, vat_number, industry, created_at')
    .order('created_at', { ascending: false })
    .limit(250);

  const companyIds = (companies ?? []).map((company) => company.id);

  const { data: clientAdmins } = companyIds.length
    ? await supabase
        .from('profiles')
        .select('company_id, email, full_name, created_at')
        .in('company_id', companyIds)
        .eq('role', 'client_admin')
        .order('created_at', { ascending: true })
        .limit(1000)
    : { data: [] as Array<{ company_id: string | null; email: string; full_name: string; created_at: string }> };

  const clientAdminByCompanyId = new Map<
    string,
    {
      email: string;
      full_name: string;
    }
  >();

  for (const admin of clientAdmins ?? []) {
    if (!admin.company_id) continue;
    if (!clientAdminByCompanyId.has(admin.company_id)) {
      clientAdminByCompanyId.set(admin.company_id, { email: admin.email, full_name: admin.full_name });
    }
  }

  const clients: ClientListItem[] = (companies ?? []).map((company) => {
    const clientAdmin = clientAdminByCompanyId.get(company.id);
    return {
      companyId: company.id,
      companyName: company.name,
      vatNumber: company.vat_number,
      industry: company.industry,
      createdAt: company.created_at,
      clientEmail: clientAdmin?.email ?? null,
      clientFullName: clientAdmin?.full_name ?? null
    };
  });

  if (clients.length === 0) {
    return (
      <section className="section-card">
        <div className="section-title">
          <span>👥</span>
          <span>Clienti</span>
        </div>

        <div className="empty-state">
          <div className="empty-icon">🗂️</div>
          <p className="empty-text">Nessun cliente presente.</p>
        </div>

        <div style={{ marginTop: 14, fontSize: 13, fontWeight: 600, color: '#64748B', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 800, color: '#0B1136', marginBottom: 8 }}>Dati di prova (locale)</div>
          <div>1) Avvia l’app con `START-QUI.command`</div>
          <div>2) Crea il cliente demo con `Crea-Cliente-Demo.command`</div>
          <div>3) Aggiungi pratiche/documenti con `Crea-Pratiche-Documenti-Demo.command`</div>
          <div style={{ marginTop: 8 }}>Se qualcosa non va, controlla `GET /api/health`.</div>
        </div>
      </section>
    );
  }

  return (
    <section className="section-card">
      <div className="section-title">
        <span>👥</span>
        <span>Clienti</span>
      </div>
      <ClientsList initialClients={clients} />
    </section>
  );
}
