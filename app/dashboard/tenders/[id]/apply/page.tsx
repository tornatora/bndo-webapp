import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, FileUp } from 'lucide-react';
import { UploadDocumentsForm } from '@/components/dashboard/UploadDocumentsForm';
import { requireUserProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export default async function TenderApplyPage({ params }: { params: { id: string } }) {
  const { profile } = await requireUserProfile();

  if (!profile.company_id) {
    notFound();
  }

  const supabase = createClient();

  const { data: match } = await supabase
    .from('tender_matches')
    .select('tender_id')
    .eq('company_id', profile.company_id)
    .eq('tender_id', params.id)
    .maybeSingle();

  const { data: tender } = await supabase
    .from('tenders')
    .select('id, authority_name, title, supplier_portal_url')
    .eq('id', params.id)
    .maybeSingle();

  if (!match || !tender) {
    notFound();
  }

  const { data: existingApplication } = await supabase
    .from('tender_applications')
    .select('id, notes, status, supplier_registry_status')
    .eq('company_id', profile.company_id)
    .eq('tender_id', params.id)
    .maybeSingle();

  const application =
    existingApplication ??
    (
      await supabase
        .from('tender_applications')
        .insert({
          company_id: profile.company_id,
          tender_id: params.id,
          status: 'draft'
        })
        .select('id, notes, status, supplier_registry_status')
        .single()
    ).data;

  if (!application?.id) {
    notFound();
  }

  const { data: documents } = await supabase
    .from('application_documents')
    .select('id, file_name, created_at, storage_path')
    .eq('application_id', application.id)
    .order('created_at', { ascending: false })
    .limit(20);

  return (
    <div className="space-y-4">
      <Link
        href={`/dashboard/tenders/${params.id}`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-brand.steel"
      >
        <ArrowLeft className="h-4 w-4" />
        Torna alla sintesi gara
      </Link>

      <article className="panel p-5 sm:p-6">
        <p className="text-sm font-semibold text-brand.steel">{tender.authority_name}</p>
        <h1 className="mt-1 text-2xl font-extrabold text-brand.navy">Partecipa: {tender.title}</h1>
        <p className="mt-2 text-sm text-slate-600">
          Carica i documenti richiesti e avvia il percorso di iscrizione all&apos;albo fornitori dell&apos;ente.
        </p>

        {tender.supplier_portal_url ? (
          <a
            href={tender.supplier_portal_url}
            target="_blank"
            rel="noreferrer"
            className="btn btn-muted mt-4"
          >
            Vai al portale albo fornitori
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : null}
      </article>

      <UploadDocumentsForm
        tenderId={params.id}
        applicationId={application.id}
        defaultNotes={application.notes ?? ''}
      />

      <section className="panel p-5">
        <h2 className="text-lg font-bold text-brand.navy">Documenti caricati</h2>
        {documents?.length ? (
          <ul className="mt-3 space-y-2">
            {documents.map((document) => (
              <li key={document.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <FileUp className="h-4 w-4 text-brand.steel" />
                    {document.file_name}
                  </span>
                  <span className="text-xs text-slate-500">
                    {new Date(document.created_at).toLocaleString('it-IT')}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Percorso storage: {document.storage_path}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Nessun file caricato finora.</p>
        )}
      </section>
    </div>
  );
}
