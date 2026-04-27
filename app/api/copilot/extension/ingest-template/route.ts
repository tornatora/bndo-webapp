import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin, hasRealServiceRoleKey } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const SelectorSchema = z.object({
  testId: z.string().optional(),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  css: z.string().optional(),
  xpath: z.string().optional(),
  text: z.string().optional(),
  role: z.string().optional(),
  name: z.string().optional(),
  id: z.string().optional(),
  inputType: z.string().optional(),
  tag: z.string().optional(),
});

const MotionSchema = z.object({
  stepId: z.string().max(120).optional(),
  pageKey: z.string().max(260).optional(),
  tabKey: z.string().max(120).optional(),
  anchor: z.string().max(260).optional(),
  clickPoint: z
    .object({
      xRatio: z.number().min(0).max(1),
      yRatio: z.number().min(0).max(1),
    })
    .optional(),
  timing: z
    .object({
      preDelayMs: z.number().int().min(0).max(6000).optional(),
      postDelayMs: z.number().int().min(0).max(6000).optional(),
    })
    .optional(),
  actionKind: z
    .enum(['click_only', 'type', 'select_open', 'select_option', 'upload', 'submit', 'scroll', 'goto'])
    .optional(),
  confirmationStatus: z.enum(['pending', 'confirmed']).optional(),
  reviewRequired: z.boolean().optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  viewport: z
    .object({
      width: z.number().int().min(1).max(10000),
      height: z.number().int().min(1).max(10000),
      scrollX: z.number().int().min(-200000).max(200000),
      scrollY: z.number().int().min(-200000).max(200000),
    })
    .optional(),
  scrollMeta: z
    .object({
      startY: z.number().int().min(-200000).max(200000).optional(),
      endY: z.number().int().min(-200000).max(200000).optional(),
      deltaY: z.number().int().min(-200000).max(200000).optional(),
      semanticReason: z.enum(['reached_bottom', 'long_scroll', 'section_scroll', 'minor_scroll']).optional(),
    })
    .optional(),
  resolverMode: z.enum(['primary', 'semantic', 'fallback_contextual', 'guided_manual_resume']).optional(),
  targetHint: z.string().max(140).optional(),
});

const StepSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('goto'), url: z.string().url(), waitUntil: z.enum(['load', 'networkidle']).optional() }),
  z.object({ type: z.literal('click'), target: SelectorSchema }).merge(MotionSchema),
  z.object({ type: z.literal('type'), target: SelectorSchema, valueFrom: z.string().min(1) }).merge(MotionSchema),
  z.object({ type: z.literal('select'), target: SelectorSchema, valueFrom: z.string().min(1) }).merge(MotionSchema),
  z.object({ type: z.literal('upload'), target: SelectorSchema, documentKey: z.string().min(1) }).merge(MotionSchema),
  z.object({ type: z.literal('scroll'), direction: z.enum(['up', 'down']), amount: z.number().int().positive().optional() }).merge(MotionSchema),
  z.object({ type: z.literal('waitFor'), target: SelectorSchema.optional(), timeoutMs: z.number().int().positive().optional() }),
  z.object({ type: z.literal('waitHuman'), message: z.string().min(1) }),
  z.object({ type: z.literal('assertUrl'), contains: z.string().min(1) }),
]);

const BodySchema = z.object({
  apiKey: z.string().optional(),
  name: z.string().trim().min(2).max(200),
  bandoKey: z.string().trim().min(1).max(200),
  proceduraKey: z.string().trim().min(1).max(200),
  domain: z.string().trim().min(3).max(220),
  saveMode: z.enum(['new_version', 'overwrite']).default('new_version'),
  status: z.enum(['draft', 'active', 'inactive']).default('active'),
  requiresFinalConfirmation: z.boolean().default(true),
  expectedDurationSeconds: z.number().int().positive().max(7200).optional(),
  fieldMapping: z.record(z.string(), z.string()).default({}),
  steps: z.array(StepSchema).min(1),
  createdBy: z.string().uuid().optional(),
});

function resolveProvidedKey(request: Request, body: z.infer<typeof BodySchema>) {
  const fromHeader = request.headers.get('x-bndo-extension-key')?.trim();
  if (fromHeader) return fromHeader;
  return body.apiKey?.trim() ?? '';
}

async function resolveOwnerProfileId(admin: any, requested?: string) {
  if (requested) return requested;

  const envOwner = process.env.BNDO_EXTENSION_OWNER_PROFILE_ID?.trim();
  if (envOwner) return envOwner;

  const { data: profile, error } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'ops_admin')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!profile?.id) throw new Error('Nessun profilo admin disponibile per salvare il template.');
  return String(profile.id);
}

export async function POST(request: Request) {
  try {
    if (!hasRealServiceRoleKey()) {
      return NextResponse.json(
        { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY non configurata: ingest cloud non disponibile.' },
        { status: 500 },
      );
    }

    const body = BodySchema.parse(await request.json());
    const provided = resolveProvidedKey(request, body);
    const expected = process.env.BNDO_EXTENSION_ADMIN_KEY?.trim() || '';

    if (expected && provided !== expected) {
      return NextResponse.json({ ok: false, error: 'API key estensione non valida.' }, { status: 401 });
    }

    const admin = getSupabaseAdmin() as any;
    const ownerId = await resolveOwnerProfileId(admin, body.createdBy);

    const { data: latest, error: latestError } = await admin
      .from('copilot_templates')
      .select('id, version')
      .eq('created_by', ownerId)
      .eq('bando_key', body.bandoKey)
      .eq('procedura_key', body.proceduraKey)
      .neq('status', 'deleted')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) throw new Error(latestError.message);

    if (body.saveMode === 'overwrite' && latest?.id) {
      const { error } = await admin
        .from('copilot_templates')
        .update({
          name: body.name,
          practice_key: body.bandoKey,
          bando_key: body.bandoKey,
          procedura_key: body.proceduraKey,
          domain: body.domain,
          status: body.status,
          steps: body.steps,
          field_mapping: body.fieldMapping,
          requires_final_confirmation: body.requiresFinalConfirmation,
          expected_duration_seconds: body.expectedDurationSeconds ?? null,
          deleted_at: null,
        })
        .eq('id', latest.id)
        .eq('created_by', ownerId);

      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, templateId: latest.id, mode: 'overwrite' });
    }

    const { data: inserted, error } = await admin
      .from('copilot_templates')
      .insert({
        name: body.name,
        practice_key: body.bandoKey,
        bando_key: body.bandoKey,
        procedura_key: body.proceduraKey,
        domain: body.domain,
        version: Number(latest?.version ?? 0) + 1,
        status: body.status,
        steps: body.steps,
        field_mapping: body.fieldMapping,
        requires_final_confirmation: body.requiresFinalConfirmation,
        expected_duration_seconds: body.expectedDurationSeconds ?? null,
        created_by: ownerId,
      })
      .select('id')
      .single();

    if (error || !inserted) {
      throw new Error(error?.message ?? 'Inserimento template fallito.');
    }

    return NextResponse.json({ ok: true, templateId: inserted.id, mode: 'new_version' });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Errore ingest template estensione.' },
      { status: 500 },
    );
  }
}
