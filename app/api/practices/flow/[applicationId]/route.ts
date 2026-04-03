import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  ensurePracticeFlow,
  loadApplicationRequirementStatus,
  loadPracticeFlowForApplication,
  type PracticeFlowState,
  type PracticeSourceChannel
} from '@/lib/practices/orchestrator';

export const runtime = 'nodejs';

const ParamsSchema = z.object({
  applicationId: z.string().uuid()
});

function buildFallbackFlow(args: {
  applicationId: string;
  tenderId: string;
  grantTitle: string;
  sourceChannel: PracticeSourceChannel;
}): PracticeFlowState {
  return {
    applicationId: args.applicationId,
    tenderId: args.tenderId,
    grantExternalId: args.tenderId,
    grantSlug: 'fallback-pratica',
    grantTitle: args.grantTitle,
    sourceChannel: args.sourceChannel,
    templateId: `fallback-${args.applicationId}`,
    metadata: { fallback: true },
    questions: [
      {
        questionKey: 'requisiti_base',
        label: 'Confermi di rispettare i requisiti base del bando?',
        description: 'Seleziona Sì solo se i requisiti risultano compatibili con il tuo profilo.',
        reasoning: 'La verifica preliminare evita avvii pratica non coerenti.',
        questionType: 'boolean',
        options: [
          { value: 'yes', label: 'Sì' },
          { value: 'no', label: 'No' }
        ],
        isRequired: true,
        validation: {},
        rule: { kind: 'critical_boolean', expected: 'yes' },
        metadata: {}
      },
      {
        questionKey: 'investimento_previsto',
        label: 'Qual è l’investimento previsto (EUR)?',
        description: 'Inserisci una stima dell’investimento totale.',
        reasoning: 'Serve per verificare la coerenza dell’importo rispetto ai limiti del bando.',
        questionType: 'number',
        options: [],
        isRequired: true,
        validation: { min: 1000, max: 200000 },
        rule: { kind: 'investment_range' },
        metadata: {}
      },
      {
        questionKey: 'note_progetto',
        label: 'Aggiungi una nota utile per il consulente',
        description: 'Facoltativa ma consigliata.',
        reasoning: 'Le note aiutano a velocizzare la verifica umana.',
        questionType: 'text',
        options: [],
        isRequired: false,
        validation: { maxLength: 800 },
        rule: { kind: 'informational' },
        metadata: {}
      }
    ],
    requirements: [
      {
        requirementKey: 'documento_identita',
        label: 'Documento di identità',
        description: 'Documento fronte/retro in corso di validità.',
        isRequired: true,
        sourceChannel: args.sourceChannel,
        metadata: { category: 'identity' }
      },
      {
        requirementKey: 'codice_fiscale',
        label: 'Codice fiscale',
        description: 'Tessera sanitaria o documento equivalente.',
        isRequired: true,
        sourceChannel: args.sourceChannel,
        metadata: { category: 'identity' }
      },
      {
        requirementKey: 'preventivi_spesa',
        label: 'Preventivi di spesa',
        description: 'Uno o più preventivi o quotazioni coerenti con l’investimento.',
        isRequired: true,
        sourceChannel: args.sourceChannel,
        metadata: { category: 'economic' }
      }
    ]
  };
}

export async function GET(_request: Request, context: { params: { applicationId: string } }) {
  try {
    const params = ParamsSchema.parse(context.params);
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Sessione non valida.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || profile.role !== 'client_admin' || !profile.company_id) {
      return NextResponse.json({ error: 'Operazione non consentita.' }, { status: 403 });
    }

    const { data: application } = await supabase
      .from('tender_applications')
      .select('id, tender_id')
      .eq('id', params.applicationId)
      .eq('company_id', profile.company_id)
      .maybeSingle();

    if (!application) {
      return NextResponse.json({ error: 'Pratica non trovata.' }, { status: 404 });
    }

    const admin = getSupabaseAdmin();
    let flow = await loadPracticeFlowForApplication(admin, params.applicationId);
    if (!flow) {
      try {
        const rebuiltFlow = await ensurePracticeFlow(admin, {
          companyId: profile.company_id,
          userId: profile.id,
          grantId: application.tender_id ?? params.applicationId,
          sourceChannel: 'direct'
        });

        flow =
          rebuiltFlow.applicationId === params.applicationId
            ? rebuiltFlow
            : {
                ...rebuiltFlow,
                applicationId: params.applicationId,
                tenderId: application.tender_id ?? rebuiltFlow.tenderId
              };
      } catch (rebuildError) {
        console.error('[PRACTICE_FLOW_REBUILD_ERROR]', rebuildError);
      }
    }

    const [requirementStatus, latestSubmission] = await Promise.all([
      loadApplicationRequirementStatus(admin, params.applicationId),
      admin
        .from('practice_quiz_submissions')
        .select('id, eligibility, completed_at')
        .eq('application_id', params.applicationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

    if (!flow) {
      const { data: tender } = await supabase
        .from('tenders')
        .select('title')
        .eq('id', application.tender_id)
        .maybeSingle();
      flow = buildFallbackFlow({
        applicationId: params.applicationId,
        tenderId: application.tender_id ?? params.applicationId,
        grantTitle: tender?.title ?? 'Pratica BNDO',
        sourceChannel: 'direct'
      });
    }

    return NextResponse.json({
      ok: true,
      flow,
      requirementStatus,
      latestSubmission: latestSubmission ?? null
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Parametri non validi.' }, { status: 422 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Impossibile caricare il flusso pratica.' },
      { status: 500 }
    );
  }
}
