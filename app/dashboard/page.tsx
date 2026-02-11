import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertCircle, ArrowUpRight, Clock3, FileCheck2 } from 'lucide-react';
import { requireUserProfile } from '@/lib/auth';
import { hasOpsAccess } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';
import { ChatPanel } from '@/components/dashboard/ChatPanel';

type TenderMatchResult = {
  id: string;
  relevance_score: number;
  status: 'new' | 'in_review' | 'participating' | 'submitted';
  tender: {
    id: string;
    authority_name: string;
    title: string;
    deadline_at: string;
    procurement_value: number | null;
  };
};

export default async function DashboardPage() {
  const { profile } = await requireUserProfile();

  if (hasOpsAccess(profile.role)) {
    redirect('/admin');
  }

  if (!profile.company_id) {
    return (
      <div className="panel p-6 text-sm text-red-700">
        Profilo non associato ad alcuna azienda. Contatta il supporto.
      </div>
    );
  }

  const supabase = createClient();

  const [{ data: matches }, { data: existingThread }] = await Promise.all([
    supabase
      .from('tender_matches')
      .select('id, relevance_score, status, tender_id')
      .eq('company_id', profile.company_id)
      .order('relevance_score', { ascending: false })
      .limit(12),
    supabase.from('consultant_threads').select('id').eq('company_id', profile.company_id).maybeSingle()
  ]);

  let threadId = existingThread?.id ?? null;

  if (!threadId) {
    const { data: createdThread } = await supabase
      .from('consultant_threads')
      .insert({ company_id: profile.company_id })
      .select('id')
      .single();

    threadId = createdThread?.id ?? null;
  }

  if (threadId) {
    await supabase.from('consultant_thread_participants').upsert(
      {
        thread_id: threadId,
        profile_id: profile.id,
        participant_role: profile.role
      },
      { onConflict: 'thread_id,profile_id', ignoreDuplicates: true }
    );
  }

  const { data: messages } = threadId
    ? await supabase
        .from('consultant_messages')
        .select('id, thread_id, sender_profile_id, body, created_at')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })
        .limit(40)
    : { data: [] as Array<{ id: string; thread_id: string; sender_profile_id: string; body: string; created_at: string }> };

  const { data: participant } = threadId
    ? await supabase
        .from('consultant_thread_participants')
        .select('last_read_at')
        .eq('thread_id', threadId)
        .eq('profile_id', profile.id)
        .maybeSingle()
    : { data: null };

  const tenderIds = [...new Set((matches ?? []).map((match) => match.tender_id))];
  const { data: tenders } = tenderIds.length
    ? await supabase
        .from('tenders')
        .select('id, authority_name, title, deadline_at, procurement_value')
        .in('id', tenderIds)
    : { data: [] };

  const tenderMap = new Map((tenders ?? []).map((tender) => [tender.id, tender]));
  const typedMatches: TenderMatchResult[] = (matches ?? []).flatMap((match) => {
    const tender = tenderMap.get(match.tender_id);

    if (!tender) return [];

    return [
      {
        id: match.id,
        relevance_score: match.relevance_score,
        status: match.status,
        tender
      }
    ];
  });

  return (
    <div className="space-y-5">
      <section className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-brand.steel">Dashboard gare</p>
            <h1 className="text-2xl font-extrabold text-brand.navy">Opportunita rilevanti per la tua azienda</h1>
          </div>

          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold">{typedMatches.length} gare attive in watchlist</p>
            <p>Match automatico aggiornato quotidianamente</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-3">
          {typedMatches.length === 0 ? (
            <div className="panel flex items-center gap-2 p-4 text-sm text-slate-600">
              <AlertCircle className="h-4 w-4 text-brand.steel" />
              Nessuna gara disponibile al momento. Il consulente ti aggiornera appena emergono nuove opportunita.
            </div>
          ) : (
            typedMatches.map((match) => {
              const deadline = new Date(match.tender.deadline_at);
              const statusClass =
                match.status === 'submitted'
                  ? 'badge badge-done'
                  : match.status === 'participating'
                    ? 'badge badge-progress'
                    : 'badge badge-new';

              return (
                <article key={match.id} className="panel p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-brand.steel">{match.tender.authority_name}</p>
                      <h2 className="mt-0.5 text-lg font-bold text-brand.navy">{match.tender.title}</h2>
                    </div>
                    <span className={statusClass}>{match.status.replace('_', ' ')}</span>
                  </div>

                  <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <p className="text-xs uppercase">Relevance</p>
                      <p className="font-semibold">{Math.round(match.relevance_score * 100)}%</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <p className="text-xs uppercase">Scadenza</p>
                      <p className="font-semibold">{deadline.toLocaleDateString('it-IT')}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <p className="text-xs uppercase">Valore</p>
                      <p className="font-semibold">
                        {match.tender.procurement_value
                          ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(
                              match.tender.procurement_value
                            )
                          : 'N/D'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/dashboard/tenders/${match.tender.id}`} className="btn btn-primary text-sm">
                      Apri sintesi
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                    <Link href={`/dashboard/tenders/${match.tender.id}/apply`} className="btn btn-muted text-sm">
                      <FileCheck2 className="h-4 w-4" />
                      Partecipa
                    </Link>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <div id="chat">
          {threadId ? (
            <ChatPanel
              threadId={threadId}
              viewerProfileId={profile.id}
              initialMessages={messages ?? []}
              initialLastReadAt={participant?.last_read_at ?? null}
            />
          ) : (
            <div className="panel p-5 text-sm text-red-700">Impossibile inizializzare la chat consulente.</div>
          )}

          <div className="panel mt-4 flex items-center gap-2 p-4 text-sm text-slate-600">
            <Clock3 className="h-4 w-4 text-brand.steel" />
            SLA medio risposta consulente: entro 2 ore lavorative.
          </div>
        </div>
      </section>
    </div>
  );
}
