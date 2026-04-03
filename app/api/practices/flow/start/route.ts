import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { fetchGrantDetail, fetchGrantExplainability, type GrantDetailRecord, type GrantExplainabilityRecord } from '@/lib/grants/details';
import { buildDeterministicConditionalQuizQuestions, generatePracticeQuizTemplateWithAI } from '@/lib/practices/llmQuizGenerator';
import {
  ensurePracticeFlow,
  loadApplicationRequirementStatus,
  type PracticeFlowState,
  type PracticeQuizQuestion,
  type PracticeSourceChannel
} from '@/lib/practices/orchestrator';

export const runtime = 'nodejs';

const PayloadSchema = z.object({
  grantId: z.string().trim().min(2).max(220),
  sourceChannel: z.enum(['scanner', 'chat', 'direct', 'admin']).default('direct')
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDocumentationQuestion(question: PracticeQuizQuestion) {
  const category =
    question.metadata && typeof question.metadata.category === 'string'
      ? normalizeText(question.metadata.category)
      : '';
  const haystack = normalizeText(
    [question.questionKey, question.label, question.description ?? '', question.reasoning ?? '', category].join(' ')
  );
  if (!haystack) return false;
  if (category.includes('document')) return true;
  if (category.includes('doc')) return true;

  return /(document|documentazione|documenti|allegat|visura|bilanc|business plan|piano impresa|preventiv|certificaz|isee|did|atto costitutivo|statuto)/.test(
    haystack
  );
}

function buildPublicFallbackQuestions(
  detail: GrantDetailRecord,
  explainability: GrantExplainabilityRecord
): PracticeQuizQuestion[] {
  return buildDeterministicConditionalQuizQuestions(detail, explainability);
}

function buildPublicRequirements(detail: GrantDetailRecord, sourceChannel: PracticeSourceChannel) {
  const requiredFromDetail = (detail.requiredDocuments ?? [])
    .map((label) => String(label ?? '').trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((label) => ({
      requirementKey: `doc_${slugify(label) || 'documento'}`,
      label,
      description: null,
      isRequired: true,
      sourceChannel,
      metadata: { source: 'grant_required_documents' as const }
    }));

  if (requiredFromDetail.length > 0) {
    return requiredFromDetail;
  }

  return [
    {
      requirementKey: 'documento_identita',
      label: 'Documento di identità',
      description: 'Documento fronte/retro in corso di validità.',
      isRequired: true,
      sourceChannel,
      metadata: { source: 'fallback' as const }
    },
    {
      requirementKey: 'codice_fiscale',
      label: 'Codice fiscale',
      description: 'Tessera sanitaria o documento equivalente.',
      isRequired: true,
      sourceChannel,
      metadata: { source: 'fallback' as const }
    }
  ];
}

async function buildPublicPracticeFlow(args: {
  grantId: string;
  sourceChannel: PracticeSourceChannel;
}): Promise<PracticeFlowState> {
  let detail: GrantDetailRecord;
  let explainability: GrantExplainabilityRecord;

  try {
    const [resolvedDetail, resolvedExplainability] = await Promise.all([
      fetchGrantDetail(args.grantId),
      fetchGrantExplainability(args.grantId)
    ]);
    detail = resolvedDetail;
    explainability = resolvedExplainability;
  } catch {
    const fallbackTitle = args.grantId.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Bando BNDO';
    detail = {
      id: args.grantId,
      title: fallbackTitle,
      authority: null,
      openingDate: null,
      deadlineDate: null,
      availabilityStatus: 'open',
      budgetTotal: null,
      aidForm: null,
      aidIntensity: null,
      beneficiaries: [],
      sectors: [],
      officialUrl: '',
      officialAttachments: [],
      description: null,
      requisitiHard: {},
      requisitiSoft: {},
      requisitiStrutturati: {}
    };
    explainability = {
      hardStatus: 'unknown',
      eligibilityScore: 50,
      completenessScore: 50,
      fitScore: 50,
      probabilityScore: 50,
      whyFit: [],
      satisfiedRequirements: [],
      missingRequirements: ['Verifica documentazione minima richiesta.'],
      applySteps: ['Verifica requisito', 'Preparazione candidatura']
    };
  }

  let aiQuestions: PracticeQuizQuestion[] = [];
  try {
    aiQuestions = await generatePracticeQuizTemplateWithAI(detail, explainability);
  } catch {
    aiQuestions = [];
  }
  const sanitizedQuestions = aiQuestions.filter((question) => !isDocumentationQuestion(question));
  const questions = sanitizedQuestions.length > 0 ? sanitizedQuestions : buildPublicFallbackQuestions(detail, explainability);
  const grantSlug = slugify(detail.title) || slugify(args.grantId) || 'bando';
  const flowToken = `public-${grantSlug}-${Date.now().toString(36)}`.slice(0, 120);

  return {
    applicationId: flowToken,
    tenderId: `public-${grantSlug}`,
    grantExternalId: detail.id || args.grantId,
    grantSlug,
    grantTitle: detail.title || 'Bando BNDO',
    sourceChannel: args.sourceChannel,
    templateId: `public-template-${flowToken}`,
    metadata: {
      publicFlow: true
    },
    questions,
    requirements: buildPublicRequirements(detail, args.sourceChannel)
  };
}

export async function POST(request: Request) {
  try {
    const payload = PayloadSchema.parse(await request.json());
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      const publicFlow = await buildPublicPracticeFlow({
        grantId: payload.grantId,
        sourceChannel: payload.sourceChannel as PracticeSourceChannel
      });
      return NextResponse.json({
        ok: true,
        flow: publicFlow,
        latestSubmission: null,
        requirementStatus: null
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || profile.role !== 'client_admin' || !profile.company_id) {
      const publicFlow = await buildPublicPracticeFlow({
        grantId: payload.grantId,
        sourceChannel: payload.sourceChannel as PracticeSourceChannel
      });
      return NextResponse.json({
        ok: true,
        flow: publicFlow,
        latestSubmission: null,
        requirementStatus: null
      });
    }

    const admin = getSupabaseAdmin();
    const flow = await ensurePracticeFlow(admin, {
      companyId: profile.company_id,
      userId: profile.id,
      grantId: payload.grantId,
      sourceChannel: payload.sourceChannel as PracticeSourceChannel
    });

    const [{ data: latestSubmission }, requirementStatus] = await Promise.all([
      admin
        .from('practice_quiz_submissions')
        .select('id, eligibility, completed_at')
        .eq('application_id', flow.applicationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      loadApplicationRequirementStatus(admin, flow.applicationId)
    ]);

    return NextResponse.json({
      ok: true,
      flow,
      latestSubmission: latestSubmission ?? null,
      requirementStatus
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Payload non valido.' }, { status: 422 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Impossibile avviare il flusso pratica.' },
      { status: 500 }
    );
  }
}
