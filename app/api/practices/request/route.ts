import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { ensureBandoApplication, practiceTitle, type PracticeType } from '@/lib/bandi';

const payloadSchema = z.object({
  practiceType: z.enum(['resto_sud_2_0', 'autoimpiego_centro_nord'])
});

const AUTO_REPLY_BODY = 'Un nostro consulente ti rispondera il prima possibile.';

type AuthProfile = {
  id: string;
  role: 'client_admin' | 'consultant' | 'ops_admin';
  full_name: string;
  email: string;
  company_id: string | null;
};

async function ensureOpsAutoReply(threadId: string) {
  const admin = getSupabaseAdmin();
  const { data: opsProfile } = await admin
    .from('profiles')
    .select('id, role')
    .in('role', ['consultant', 'ops_admin'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!opsProfile?.id) {
    return;
  }

  await admin.from('consultant_thread_participants').upsert(
    {
      thread_id: threadId,
      profile_id: opsProfile.id,
      participant_role: opsProfile.role,
      last_read_at: new Date().toISOString()
    },
    { onConflict: 'thread_id,profile_id' }
  );

  await admin.from('consultant_messages').insert({
    thread_id: threadId,
    sender_profile_id: opsProfile.id,
    body: AUTO_REPLY_BODY
  });
}

export async function POST(request: Request) {
  try {
    const payload = payloadSchema.parse(await request.json());
    const practiceType = payload.practiceType as PracticeType;
    const supabase = createClient();

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Sessione non valida.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, full_name, email, company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: 'Profilo non trovato.' }, { status: 403 });
    }

    const typedProfile = profile as AuthProfile;

    if (typedProfile.role !== 'client_admin') {
      return NextResponse.json({ error: 'Solo gli utenti clienti possono richiedere nuove pratiche.' }, { status: 403 });
    }

    if (!typedProfile.company_id) {
      return NextResponse.json({ error: 'Profilo non associato ad alcuna azienda.' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const email = typedProfile.email.toLowerCase();

    const { data: latestQuiz } = await admin
      .from('quiz_submissions')
      .select('id, eligibility, bando_type, created_at, phone')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestQuiz) {
      return NextResponse.json(
        { error: 'Completa prima il quiz requisiti per poter richiedere una nuova pratica.' },
        { status: 403 }
      );
    }

    if (latestQuiz.eligibility !== 'eligible') {
      return NextResponse.json(
        { error: 'Il tuo ultimo quiz risulta non idoneo. Completa nuovamente il quiz prima di richiedere la pratica.' },
        { status: 403 }
      );
    }

    const allowedPractice: PracticeType | null =
      latestQuiz.bando_type === 'sud'
        ? 'resto_sud_2_0'
        : latestQuiz.bando_type === 'centro_nord'
          ? 'autoimpiego_centro_nord'
          : null;

    if (allowedPractice && allowedPractice !== practiceType) {
      return NextResponse.json(
        { error: `In base al tuo quiz puoi richiedere solo: ${practiceTitle(allowedPractice)}.` },
        { status: 403 }
      );
    }

    const { data: company } = await admin.from('companies').select('name').eq('id', typedProfile.company_id).maybeSingle();

    const practiceLabel = practiceTitle(practiceType);
    const challenge = `Richiesta nuova pratica dashboard: ${practiceLabel} | Quiz: ${latestQuiz.id}`;

    const { error: leadError } = await admin.from('leads').insert({
      full_name: typedProfile.full_name,
      email,
      company_name: company?.name ?? 'Cliente BNDO',
      phone: latestQuiz.phone ?? null,
      challenge
    });

    if (leadError) {
      return NextResponse.json({ error: 'Impossibile salvare la richiesta pratica.' }, { status: 500 });
    }

    // Create or ensure the application exists so the admin sees it in "Pratiche richieste".
    await ensureBandoApplication(admin, typedProfile.company_id, practiceType);

    const { data: existingThread } = await admin
      .from('consultant_threads')
      .select('id')
      .eq('company_id', typedProfile.company_id)
      .maybeSingle();

    let threadId = existingThread?.id ?? null;

    if (!threadId) {
      const { data: createdThread, error: threadCreateError } = await admin
        .from('consultant_threads')
        .insert({ company_id: typedProfile.company_id })
        .select('id')
        .single();

      if (threadCreateError || !createdThread?.id) {
        return NextResponse.json({ error: 'Impossibile inizializzare la chat consulente.' }, { status: 500 });
      }

      threadId = createdThread.id;
    }

    await admin.from('consultant_thread_participants').upsert(
      {
        thread_id: threadId,
        profile_id: typedProfile.id,
        participant_role: typedProfile.role,
        last_read_at: new Date().toISOString()
      },
      { onConflict: 'thread_id,profile_id' }
    );

    await admin.from('consultant_messages').insert({
      thread_id: threadId,
      sender_profile_id: typedProfile.id,
      body: `Richiesta nuova pratica: ${practiceLabel}. Ho completato il quiz e desidero avviare la pratica.`
    });

    await ensureOpsAutoReply(threadId);

    return NextResponse.json({
      success: true,
      message: `Richiesta ${practiceLabel} inviata. Un consulente ti rispondera il prima possibile.`
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Richiesta non valida.' }, { status: 422 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Errore richiesta pratica.' },
      { status: 500 }
    );
  }
}
