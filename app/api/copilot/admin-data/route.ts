import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserProfile } from '@/lib/auth';
import { hasAdminAccess } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  clientId: z.string().uuid().optional(),
  bando: z.string().trim().max(160).optional(),
  procedura: z.string().trim().max(160).optional(),
  status: z.string().trim().max(40).optional(),
  dateFrom: z.string().trim().max(40).optional(),
  dateTo: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(10).max(400).optional(),
});

const MutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('addDomain'), domain: z.string().trim().min(4).max(200) }),
  z.object({ action: z.literal('toggleDomain'), id: z.string().uuid(), active: z.boolean() }),
  z.object({ action: z.literal('removeDomain'), id: z.string().uuid() }),
]);

type SessionRow = {
  id: string;
  status: string;
  progress: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  current_message: string | null;
  current_step: string | null;
  practice_key: string | null;
  procedure_key?: string | null;
  error_message: string | null;
  demo_mode: boolean;
  client_id: string;
  template_id: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type TemplateRow = {
  id: string;
  name: string | null;
  bando_key: string | null;
  procedura_key: string | null;
  version: number | null;
  status: string | null;
};

type ProfileLite = {
  fullName: string;
  email: string;
};

type TemplateLite = {
  id: string;
  name: string;
  bandoKey: string;
  proceduraKey: string;
  version: number;
  status: string;
};

function parseDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function normalizeDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}

function createHealthCheckPayload() {
  const hasBrowserbase = Boolean(process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID);
  const hasExtension = Boolean(process.env.BROWSERBASE_EXTENSION_ID);
  const hasWorkerHook = Boolean(process.env.COPILOT_WORKER_WEBHOOK_URL);

  return {
    db: 'ok',
    browserbase: hasBrowserbase ? 'ok' : 'missing_config',
    extension: hasExtension ? 'ok' : 'missing_config',
    worker: hasWorkerHook || process.env.NODE_ENV !== 'production' ? 'ok' : 'missing_config',
  } as const;
}

export async function GET(request: Request) {
  try {
    const { profile } = await requireUserProfile();
    if (!hasAdminAccess(profile.role)) {
      return NextResponse.json({ ok: false, error: 'Accesso riservato admin.' }, { status: 403 });
    }

    const url = new URL(request.url);
    const query = QuerySchema.parse({
      clientId: url.searchParams.get('clientId') ?? undefined,
      bando: url.searchParams.get('bando') ?? undefined,
      procedura: url.searchParams.get('procedura') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      dateFrom: url.searchParams.get('dateFrom') ?? undefined,
      dateTo: url.searchParams.get('dateTo') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    });

    const supabase = createClient() as any;
    let sessionsQuery = supabase
      .from('copilot_sessions')
      .select('id, status, progress, started_at, completed_at, created_at, current_message, current_step, practice_key, procedure_key, error_message, demo_mode, client_id, template_id')
      .order('created_at', { ascending: false })
      .limit(query.limit ?? 150);

    if (query.clientId) sessionsQuery = sessionsQuery.eq('client_id', query.clientId);
    if (query.status) sessionsQuery = sessionsQuery.eq('status', query.status);
    if (query.bando) sessionsQuery = sessionsQuery.eq('practice_key', query.bando);
    if (query.procedura) sessionsQuery = sessionsQuery.eq('procedure_key', query.procedura);

    const fromDate = parseDate(query.dateFrom);
    const toDate = parseDate(query.dateTo);
    if (fromDate) sessionsQuery = sessionsQuery.gte('created_at', fromDate.toISOString());
    if (toDate) sessionsQuery = sessionsQuery.lte('created_at', toDate.toISOString());

    const [{ data: sessions, error: sessionsError }, { data: domains }] = await Promise.all([
      sessionsQuery,
      supabase
        .from('copilot_allowed_domains')
        .select('id, domain, active, created_at')
        .order('created_at', { ascending: true })
        .limit(200)
        .throwOnError()
        .then((row: any) => row)
        .catch(() => ({ data: [] })),
    ]);

    if (sessionsError) {
      throw new Error(sessionsError.message);
    }

    const typedSessions = (sessions ?? []) as SessionRow[];
    const clientIds = Array.from(new Set(typedSessions.map((row) => String(row.client_id)).filter(Boolean)));
    const templateIds = Array.from(new Set(typedSessions.map((row) => String(row.template_id ?? '')).filter(Boolean)));

    const [{ data: profiles }, { data: templates }] = await Promise.all([
      clientIds.length
        ? supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', clientIds)
            .throwOnError()
            .then((row: any) => row)
            .catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
      templateIds.length
        ? supabase
            .from('copilot_templates')
            .select('id, name, bando_key, procedura_key, version, status')
            .in('id', templateIds)
            .throwOnError()
            .then((row: any) => row)
            .catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
    ]);

    const typedProfiles = (profiles ?? []) as ProfileRow[];
    const typedTemplates = (templates ?? []) as TemplateRow[];

    const profileById = new Map<string, ProfileLite>(
      typedProfiles.map((row) => [String(row.id), { fullName: String(row.full_name ?? ''), email: String(row.email ?? '') }]),
    );
    const templateById = new Map<string, TemplateLite>(
      typedTemplates.map((row) => [
        String(row.id),
        {
          id: String(row.id),
          name: String(row.name ?? 'Template'),
          bandoKey: String(row.bando_key ?? ''),
          proceduraKey: String(row.procedura_key ?? ''),
          version: Number(row.version ?? 1),
          status: String(row.status ?? 'draft'),
        },
      ]),
    );

    const completed = typedSessions.filter((row) => row.status === 'completed').length;
    const waitingHuman = typedSessions.filter((row) => row.status === 'waiting_human').length;
    const failed = typedSessions.filter((row) => row.status === 'failed').length;

    const durationValues = typedSessions
      .map((row) => {
        if (!row.started_at || !row.completed_at) return null;
        const started = new Date(row.started_at).getTime();
        const completedAt = new Date(row.completed_at).getTime();
        if (Number.isNaN(started) || Number.isNaN(completedAt) || completedAt < started) return null;
        return Math.round((completedAt - started) / 1000);
      })
      .filter((value): value is number => Number.isFinite(value));

    const avgSeconds = durationValues.length
      ? Math.round(durationValues.reduce((sum, value) => sum + value, 0) / durationValues.length)
      : 0;

    const table = typedSessions.map((row) => {
      const client = profileById.get(String(row.client_id));
      const template = row.template_id ? templateById.get(String(row.template_id)) ?? null : null;
      return {
        id: row.id,
        status: row.status,
        progress: Number(row.progress ?? 0),
        startedAt: row.started_at,
        completedAt: row.completed_at,
        createdAt: row.created_at,
        currentMessage: row.current_message,
        currentStep: row.current_step,
        errorMessage: row.error_message,
        demoMode: Boolean(row.demo_mode),
        bandoKey: row.practice_key ?? template?.bandoKey ?? '',
        proceduraKey: row.procedure_key ?? template?.proceduraKey ?? '',
        client: {
          id: row.client_id,
          fullName: client?.fullName ?? 'Cliente',
          email: client?.email ?? '',
        },
        template: template
          ? {
              id: template.id,
              name: template.name,
              version: template.version,
              status: template.status,
            }
          : null,
      };
    });

    return NextResponse.json({
      ok: true,
      metrics: {
        completed,
        waitingHuman,
        failed,
        avgDurationSeconds: avgSeconds,
      },
      rows: table,
      health: createHealthCheckPayload(),
      allowedDomains: (domains ?? []).map((row: any) => ({
        id: String(row.id),
        domain: String(row.domain),
        active: Boolean(row.active),
        createdAt: String(row.created_at ?? ''),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Errore lettura dati Co-pilot.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const { profile } = await requireUserProfile();
    if (!hasAdminAccess(profile.role)) {
      return NextResponse.json({ ok: false, error: 'Accesso riservato admin.' }, { status: 403 });
    }

    const body = MutationSchema.parse(await request.json());
    const supabase = createClient() as any;

    if (body.action === 'addDomain') {
      const domain = normalizeDomain(body.domain);
      const { error } = await supabase.from('copilot_allowed_domains').insert({
        domain,
        active: true,
        created_by: profile.id,
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'toggleDomain') {
      const { error } = await supabase
        .from('copilot_allowed_domains')
        .update({ active: body.active })
        .eq('id', body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    const { error } = await supabase.from('copilot_allowed_domains').delete().eq('id', body.id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Errore aggiornamento dati Co-pilot.' },
      { status: 500 },
    );
  }
}
