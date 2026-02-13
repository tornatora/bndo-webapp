import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  email: z.string().email(),
  practices: z.number().int().min(1).max(6).optional()
});

const PRACTICE_STATUS = ['draft', 'submitted', 'reviewed'] as const;
const REGISTRY_STATUS = ['pending', 'in_progress', 'completed'] as const;

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
    const practicesTarget = payload.practices ?? 2;

    const supabaseAdmin = getSupabaseAdmin();

    const { data: clientProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, company_id, email')
      .eq('email', payload.email)
      .maybeSingle();

    if (!clientProfile?.company_id) {
      return NextResponse.json(
        { error: 'Cliente non trovato. Prima crea il cliente demo.' },
        { status: 404 }
      );
    }

    const companyId = clientProfile.company_id;
    const clientProfileId = clientProfile.id;

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

    if (!candidateTenderIds.length) {
      return NextResponse.json({ error: 'Nessun bando disponibile per creare pratiche demo.' }, { status: 409 });
    }

    const tenderIdsToUse = [...new Set(candidateTenderIds)].slice(0, practicesTarget);

    const demoNote = `DEMO: pratica creata automaticamente (${new Date().toLocaleString('it-IT')})`;

    const { error: createAppsError } = await supabaseAdmin.from('tender_applications').upsert(
      tenderIdsToUse.map((tenderId, index) => ({
        company_id: companyId,
        tender_id: tenderId,
        status: PRACTICE_STATUS[index % PRACTICE_STATUS.length],
        supplier_registry_status: REGISTRY_STATUS[index % REGISTRY_STATUS.length],
        notes: demoNote
      })),
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
      .in('tender_id', tenderIdsToUse)
      .order('created_at', { ascending: false })
      .limit(practicesTarget);

    const docsInserted: Array<{ applicationId: string; storagePath: string; fileName: string }> = [];

    for (const [index, app] of (seededApps ?? []).entries()) {
      // Alternate: one practice with docs, one without, so "mancanti" is testable.
      const shouldCreateDocs = index % 2 === 0;
      if (!shouldCreateDocs) continue;

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
      practices: seededApps?.length ?? 0,
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
