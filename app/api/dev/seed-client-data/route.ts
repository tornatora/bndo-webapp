import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  email: z.string().email(),
  practices: z.number().int().min(1).max(6).optional(),
  resetExisting: z.boolean().optional()
});

const PRACTICE_STATUS = ['draft', 'submitted', 'reviewed'] as const;
const REGISTRY_STATUS = ['pending', 'in_progress', 'completed'] as const;

const DEMO_TENDERS = [
  {
    authority_name: 'Invitalia',
    title: 'Resto al Sud 2.0',
    summary: 'Bando demo per finanza agevolata (seed locale).'
  },
  {
    authority_name: 'Invitalia',
    title: 'Autoimpiego Centro Nord',
    summary: 'Bando demo per finanza agevolata (seed locale).'
  }
] as const;

const QA_BASELINE_PRACTICES = [
  {
    id: '769117e6-ab97-4b8a-9ff1-bec0e14879e6',
    title: 'Resto al Sud 2.0',
    status: 'draft',
    supplierRegistryStatus: 'pending',
    shouldCreateDocs: true
  },
  {
    id: 'a13a8bde-e544-4a14-b73f-61dd0ca8fe90',
    title: 'Autoimpiego Centro Nord',
    status: 'submitted',
    supplierRegistryStatus: 'in_progress',
    shouldCreateDocs: false
  }
] as const;

const DOC_TEMPLATES = [
  {
    key: 'visura',
    fileName: 'Visura-camerale-demo.txt',
    content:
      'DEMO: Visura camerale (contenuto fittizio)\n\nAzienda: Azienda Demo Srl\nData: ' + new Date().toISOString()
  },
  {
    key: 'bilancio',
    fileName: 'Bilancio-2023-demo.txt',
    content:
      'DEMO: Bilancio 2023 (contenuto fittizio)\n\nRicavi: 1.234.567\nEBITDA: 123.456\nData: ' + new Date().toISOString()
  },
  {
    key: 'id',
    fileName: 'Documento-identita-demo.txt',
    content:
      'DEMO: Documento identita (contenuto fittizio)\n\nNome: Mario Rossi\nData: ' + new Date().toISOString()
  }
] as const;

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production.' }, { status: 404 });
  }

  const expectedSecret = process.env.DEV_PROVISION_SECRET;
  const providedSecret = request.headers.get('x-dev-provision-secret');

  if (!expectedSecret || !providedSecret || expectedSecret !== providedSecret) {
    return NextResponse.json({ error: 'Unauthorized dev seed request.' }, { status: 401 });
  }

  try {
    const payload = requestSchema.parse(await request.json());
    const normalizedEmail = payload.email.toLowerCase();
    const practicesTarget = payload.practices ?? 2;

    const supabaseAdmin = getSupabaseAdmin();

    const { data: clientProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, company_id, email')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (!clientProfile) {
      return NextResponse.json({ error: 'Cliente non trovato. Prima crea il cliente demo.' }, { status: 404 });
    }

    // Some local accounts may exist without a company_id (e.g. created via alternative onboarding).
    // For dev seeding we auto-provision a minimal company and attach it to the profile.
    let companyId: string | null = clientProfile.company_id;
    if (!companyId) {
      const companyName = `Cliente demo (${payload.email.split('@')[0] ?? 'utente'})`;
      const { data: company, error: companyError } = await supabaseAdmin
        .from('companies')
        .insert({ name: companyName })
        .select('id')
        .single();

      if (companyError || !company?.id) {
        return NextResponse.json(
          { error: `Creazione azienda fallita: ${companyError?.message ?? 'errore sconosciuto'}` },
          { status: 500 }
        );
      }

      companyId = company.id;
      const { error: profileUpdateError } = await supabaseAdmin
        .from('profiles')
        .update({ company_id: companyId })
        .eq('id', clientProfile.id);

      if (profileUpdateError) {
        return NextResponse.json(
          { error: `Aggiornamento profilo fallito: ${profileUpdateError.message}` },
          { status: 500 }
        );
      }
    }

    const clientProfileId = clientProfile.id;

    if (payload.resetExisting) {
      const { data: existingApps, error: existingAppsError } = await supabaseAdmin
        .from('tender_applications')
        .select('id')
        .eq('company_id', companyId);

      if (existingAppsError) {
        return NextResponse.json({ error: existingAppsError.message }, { status: 500 });
      }

      const existingAppIds = (existingApps ?? []).map((app) => app.id);
      if (existingAppIds.length) {
        const { error: deleteDocsError } = await supabaseAdmin
          .from('application_documents')
          .delete()
          .in('application_id', existingAppIds);

        if (deleteDocsError) {
          return NextResponse.json({ error: deleteDocsError.message }, { status: 500 });
        }

        const { error: deleteAppsError } = await supabaseAdmin
          .from('tender_applications')
          .delete()
          .eq('company_id', companyId);

        if (deleteAppsError) {
          return NextResponse.json({ error: deleteAppsError.message }, { status: 500 });
        }
      }
    }

    // Ensure a thread exists so admin can chat even if the client never opened the dashboard.
    await supabaseAdmin.from('consultant_threads').upsert({ company_id: companyId }, { onConflict: 'company_id' });

    const { data: matches } = await supabaseAdmin
      .from('tender_matches')
      .select('tender_id, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(12);

    let candidateTenderIds = (matches ?? []).map((match) => match.tender_id);
    if (!candidateTenderIds.length) {
      const { data: tenders } = await supabaseAdmin
        .from('tenders')
        .select('id, created_at')
        .order('created_at', { ascending: false })
        .limit(12);
      candidateTenderIds = (tenders ?? []).map((tender) => tender.id);
    }

    // Fresh Supabase project: create our 2 in-scope tenders so demo seeding always works.
    const deadline = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString();
    const { data: existingDefaults } = await supabaseAdmin
      .from('tenders')
      .select('id, title')
      .in(
        'title',
        DEMO_TENDERS.map((t) => t.title)
      );

    const existingTitles = new Set((existingDefaults ?? []).map((t) => t.title));
    const toInsert = DEMO_TENDERS.filter((t) => !existingTitles.has(t.title)).map((tender) => ({
      ...tender,
      deadline_at: deadline
    }));

    if (toInsert.length) {
      const { error: insertError } = await supabaseAdmin.from('tenders').insert(toInsert);
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    const { data: ensuredDefaults } = await supabaseAdmin
      .from('tenders')
      .select('id, title')
      .in(
        'title',
        DEMO_TENDERS.map((t) => t.title)
      );

    if (!candidateTenderIds.length) {
      candidateTenderIds = (ensuredDefaults ?? []).map((t) => t.id);
    }

    const defaultTenderIdByTitle = new Map((ensuredDefaults ?? []).map((t) => [t.title, t.id]));
    const useBaselineQaIds =
      Boolean(payload.resetExisting) && process.env.TEST_CLIENT_EMAIL?.toLowerCase() === normalizedEmail;

    const seededPracticeConfigs: Array<{
      applicationId?: string;
      tenderId: string;
      status: (typeof PRACTICE_STATUS)[number];
      supplierRegistryStatus: (typeof REGISTRY_STATUS)[number];
      shouldCreateDocs: boolean;
    }> = [];

    if (useBaselineQaIds) {
      for (const practice of QA_BASELINE_PRACTICES.slice(0, practicesTarget)) {
        const tenderId = defaultTenderIdByTitle.get(practice.title);
        if (!tenderId) {
          return NextResponse.json(
            { error: `Tender demo mancante per il seed QA: ${practice.title}` },
            { status: 500 }
          );
        }

        seededPracticeConfigs.push({
          applicationId: practice.id,
          tenderId,
          status: practice.status,
          supplierRegistryStatus: practice.supplierRegistryStatus,
          shouldCreateDocs: practice.shouldCreateDocs
        });
      }
    }

    const additionalTenderIds = [...new Set(candidateTenderIds)].filter(
      (tenderId) => !seededPracticeConfigs.some((config) => config.tenderId === tenderId)
    );
    const basePracticeCount = seededPracticeConfigs.length;

    for (const [index, tenderId] of additionalTenderIds.entries()) {
      if (seededPracticeConfigs.length >= practicesTarget) break;

      const absoluteIndex = basePracticeCount + index;
      seededPracticeConfigs.push({
        tenderId,
        status: PRACTICE_STATUS[absoluteIndex % PRACTICE_STATUS.length],
        supplierRegistryStatus: REGISTRY_STATUS[absoluteIndex % REGISTRY_STATUS.length],
        shouldCreateDocs: absoluteIndex % 2 === 0
      });
    }

    const demoNote = `DEMO: pratica creata automaticamente (${new Date().toLocaleString('it-IT')})`;
    const practiceRows = seededPracticeConfigs.map((config) => ({
      ...(config.applicationId ? { id: config.applicationId } : {}),
      company_id: companyId,
      tender_id: config.tenderId,
      status: config.status,
      supplier_registry_status: config.supplierRegistryStatus,
      notes: demoNote
    }));

    if (payload.resetExisting && useBaselineQaIds) {
      const reservedApplicationIds = practiceRows
        .map((row) => row.id)
        .filter((id): id is string => Boolean(id));

      if (reservedApplicationIds.length) {
        const { error: deleteReservedDocsError } = await supabaseAdmin
          .from('application_documents')
          .delete()
          .in('application_id', reservedApplicationIds);

        if (deleteReservedDocsError) {
          return NextResponse.json({ error: deleteReservedDocsError.message }, { status: 500 });
        }

        const { error: deleteReservedAppsError } = await supabaseAdmin
          .from('tender_applications')
          .delete()
          .in('id', reservedApplicationIds);

        if (deleteReservedAppsError) {
          return NextResponse.json({ error: deleteReservedAppsError.message }, { status: 500 });
        }
      }
    }

    const { error: createAppsError } = payload.resetExisting
      ? await supabaseAdmin.from('tender_applications').insert(practiceRows)
      : await supabaseAdmin.from('tender_applications').upsert(
          practiceRows.map(({ id, ...row }) => row),
          {
            onConflict: 'company_id,tender_id',
            ignoreDuplicates: true
          }
        );

    if (createAppsError) {
      return NextResponse.json({ error: createAppsError.message }, { status: 500 });
    }

    const { data: seededApps } = await supabaseAdmin
      .from('tender_applications')
      .select('id, tender_id, created_at')
      .eq('company_id', companyId)
      .in(
        'tender_id',
        seededPracticeConfigs.map((config) => config.tenderId)
      );

    const docsInserted: Array<{ applicationId: string; storagePath: string; fileName: string }> = [];
    const seededAppByTenderId = new Map((seededApps ?? []).map((app) => [app.tender_id, app]));

    for (const config of seededPracticeConfigs) {
      if (!config.shouldCreateDocs) continue;

      const app = seededAppByTenderId.get(config.tenderId);
      if (!app) continue;

      for (const doc of DOC_TEMPLATES.slice(0, 2)) {
        const storagePath = `demo/${companyId}/${app.id}/${doc.key}.txt`;
        const buffer = Buffer.from(doc.content, 'utf8');

        const upload = await supabaseAdmin.storage
          .from('application-documents')
          .upload(storagePath, buffer, { contentType: 'text/plain', upsert: true });

        if (upload.error) {
          return NextResponse.json(
            { error: `Upload storage fallito: ${upload.error.message}` },
            { status: 500 }
          );
        }

        const { error: docError } = await supabaseAdmin.from('application_documents').upsert(
          {
            application_id: app.id,
            uploaded_by: clientProfileId,
            file_name: doc.fileName,
            storage_path: storagePath,
            file_size: buffer.length,
            mime_type: 'text/plain'
          },
          { onConflict: 'storage_path' }
        );

        if (docError) {
          return NextResponse.json({ error: docError.message }, { status: 500 });
        }

        docsInserted.push({ applicationId: app.id, storagePath, fileName: doc.fileName });
      }
    }

    // Optional: seed 1 message so the chat isn't empty.
    const { data: thread } = await supabaseAdmin
      .from('consultant_threads')
      .select('id')
      .eq('company_id', companyId)
      .maybeSingle();

    if (thread?.id) {
      await supabaseAdmin.from('consultant_messages').insert({
        thread_id: thread.id,
        sender_profile_id: clientProfileId,
        body: 'Ciao! Ho iniziato la pratica, ti carico i documenti appena possibile (DEMO).'
      });
    }

    return NextResponse.json({
      success: true,
      companyId,
      practices: seededApps?.length ?? seededPracticeConfigs.length,
      createdDocuments: docsInserted.length,
      documents: docsInserted
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 422 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Seed failed.' },
      { status: 500 }
    );
  }
}
