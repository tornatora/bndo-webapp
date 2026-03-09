import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, FileText } from 'lucide-react';
import { requireUserProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export default async function TenderDetailPage({ params }: { params: { id: string } }) {
  const { profile } = await requireUserProfile();

  if (!profile.company_id) {
    notFound();
  }

  const supabase = createClient();

  const { data: match } = await supabase
    .from('tender_matches')
    .select('id, status, relevance_score')
    .eq('company_id', profile.company_id)
    .eq('tender_id', params.id)
    .maybeSingle();

  const { data: tender } = await supabase
    .from('tenders')
    .select(
      'id, authority_name, title, cpv_code, summary, deadline_at, procurement_value, dossier_url, supplier_portal_url'
    )
    .eq('id', params.id)
    .maybeSingle();

  if (!match || !tender) {
    notFound();
  }

  const { data: application } = await supabase
    .from('tender_applications')
    .select('id, status, supplier_registry_status')
    .eq('company_id', profile.company_id)
    .eq('tender_id', params.id)
    .maybeSingle();

  return (
    <div className="space-y-4">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-brand.steel">
        <ArrowLeft className="h-4 w-4" />
        Torna alla dashboard
      </Link>

      <article className="panel p-5 sm:p-6">
        <p className="text-sm font-semibold text-brand.steel">{tender.authority_name}</p>
        <h1 className="mt-1 text-2xl font-extrabold text-brand.navy">{tender.title}</h1>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="text-xs uppercase text-slate-500">Codice CPV</p>
            <p className="font-semibold text-brand.navy">{tender.cpv_code ?? 'N/D'}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="text-xs uppercase text-slate-500">Scadenza</p>
            <p className="font-semibold text-brand.navy">
              {new Date(tender.deadline_at).toLocaleDateString('it-IT')}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="text-xs uppercase text-slate-500">Valore</p>
            <p className="font-semibold text-brand.navy">
              {tender.procurement_value
                ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(
                    tender.procurement_value
                  )
                : 'N/D'}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="text-xs uppercase text-slate-500">Match</p>
            <p className="font-semibold text-brand.navy">{Math.round(match.relevance_score * 100)}%</p>
          </div>
        </div>

        <section className="mt-5 rounded-2xl bg-slate-50 p-4">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-brand.steel">Sintesi operativa</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{tender.summary}</p>
        </section>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={`/dashboard/tenders/${params.id}/apply`} className="btn btn-primary">
            <FileText className="h-4 w-4" />
            Partecipa alla gara
          </Link>
          {tender.dossier_url ? (
            <a href={tender.dossier_url} target="_blank" className="btn btn-muted" rel="noreferrer">
              Dossier ufficiale
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
          {tender.supplier_portal_url ? (
            <a href={tender.supplier_portal_url} target="_blank" className="btn btn-muted" rel="noreferrer">
              Albo fornitori ente
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
        </div>

        {application ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            Candidatura presente. Stato pratica: <strong>{application.status}</strong>. Iscrizione albo:{' '}
            <strong>{application.supplier_registry_status}</strong>.
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            Nessuna candidatura avviata su questa gara.
          </div>
        )}
      </article>
    </div>
  );
}
