import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { redactJson } from '@/lib/ops/redaction';
import { rejectCrossSiteMutation } from '@/lib/security/http';
import { checkRateLimit } from '@/lib/security/rateLimit';

const EventSchema = z.object({
  eventType: z.string().trim().min(2).max(120),
  sessionId: z.string().trim().min(4).max(120).optional(),
  pagePath: z.string().trim().max(500).optional(),
  channel: z.string().trim().max(60).optional(),
  applicationId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

function inferActorRole(role: unknown) {
  if (role === 'ops_admin' || role === 'consultant' || role === 'client_admin') return role;
  return null;
}

function inferDeviceClass(userAgent: string) {
  const ua = userAgent.toLowerCase();
  if (!ua) return 'unknown';
  if (ua.includes('ipad') || ua.includes('tablet')) return 'tablet';
  if (
    ua.includes('android') ||
    ua.includes('iphone') ||
    ua.includes('ipod') ||
    ua.includes('mobile') ||
    ua.includes('iemobile')
  ) {
    return 'mobile';
  }
  return 'desktop';
}

export async function POST(request: Request) {
  const csrf = rejectCrossSiteMutation(request);
  if (csrf) return csrf;

  const rate = checkRateLimit(request, { keyPrefix: 'telemetry-event', windowMs: 60_000, max: 200 });
  if (!rate.ok) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } });
  }

  const payload = EventSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return NextResponse.json({ error: 'Payload non valido.' }, { status: 422 });

  let actorProfileId: string | null = null;
  let actorRole: string | null = null;
  let companyId = payload.data.companyId ?? null;
  const userAgent = request.headers.get('user-agent') ?? '';
  const deviceClass = inferDeviceClass(userAgent);
  const countryCode =
    request.headers.get('x-vercel-ip-country') ??
    request.headers.get('cf-ipcountry') ??
    request.headers.get('x-country') ??
    null;

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id) {
      actorProfileId = user.id;
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, company_id')
        .eq('id', user.id)
        .maybeSingle();
      actorRole = inferActorRole(profile?.role);
      if (!companyId && profile?.company_id) companyId = profile.company_id;
    }
  } catch {
    // Public telemetry can still be captured anonymously.
  }

  const admin = getSupabaseAdmin() as any;
  const metadata = redactJson({
    ...(payload.data.metadata ?? {}),
    deviceClass,
    countryCode,
  });
  const { error } = await admin.from('platform_events').insert({
    event_type: payload.data.eventType,
    actor_profile_id: actorProfileId,
    actor_role: actorRole,
    company_id: companyId,
    application_id: payload.data.applicationId ?? null,
    session_id: payload.data.sessionId ?? null,
    page_path: payload.data.pagePath ?? null,
    channel: payload.data.channel ?? null,
    metadata,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
