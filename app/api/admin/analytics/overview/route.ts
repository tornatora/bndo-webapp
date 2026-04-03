import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsProfile } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isMissingTable } from '@/lib/ops/dbErrorGuards';

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});

type EventRow = {
  event_type: string;
  actor_profile_id: string | null;
  actor_role: string | null;
  session_id: string | null;
  page_path: string | null;
  channel: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export async function GET(request: Request) {
  await requireOpsProfile();
  const parsed = QuerySchema.safeParse({
    days: new URL(request.url).searchParams.get('days') ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: 'Parametri non validi.' }, { status: 422 });

  const days = parsed.data.days ?? 30;
  const from = new Date();
  from.setDate(from.getDate() - days);
  const fromIso = from.toISOString();

  const admin = getSupabaseAdmin() as any;
  const { data, error } = await admin
    .from('platform_events')
    .select('event_type, actor_profile_id, actor_role, session_id, page_path, channel, metadata, created_at')
    .gte('created_at', fromIso)
    .order('created_at', { ascending: false })
    .limit(10000);

  if (error) {
    if (isMissingTable(error, 'platform_events')) {
      return NextResponse.json({
        ok: true,
        windowDays: days,
        notice: 'Analytics avanzati non ancora attivi su questo ambiente.',
        totals: { events: 0, sessions: 0, actors: 0 },
        funnel: {
          scannerStarted: 0,
          scannerCompleted: 0,
          quizStarted: 0,
          quizCompleted: 0,
          onboardingStarted: 0,
          onboardingCompleted: 0,
          practiceCreated: 0,
          practiceActivated: 0,
        },
        topPages: [],
        eventTypeBreakdown: [],
        channelBreakdown: [],
        deviceBreakdown: [],
        geoBreakdown: [],
        eventsTimeline: [],
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as EventRow[];
  const sessions = new Set<string>();
  const actorSet = new Set<string>();
  const pageViewsByPath = new Map<string, number>();
  const eventsByType = new Map<string, number>();
  const eventsByChannel = new Map<string, number>();
  const sessionsByDevice = new Map<string, Set<string>>();
  const sessionsByCountry = new Map<string, Set<string>>();
  const byDay = new Map<string, number>();

  let scannerStarted = 0;
  let scannerCompleted = 0;
  let quizStarted = 0;
  let quizCompleted = 0;
  let onboardingStarted = 0;
  let onboardingCompleted = 0;
  let practiceCreated = 0;
  let practiceActivated = 0;

  for (const row of rows) {
    if (row.session_id) sessions.add(row.session_id);
    if (row.actor_profile_id) actorSet.add(row.actor_profile_id);
    if (row.page_path) pageViewsByPath.set(row.page_path, (pageViewsByPath.get(row.page_path) ?? 0) + 1);
    eventsByType.set(row.event_type, (eventsByType.get(row.event_type) ?? 0) + 1);
    eventsByChannel.set(row.channel ?? 'unknown', (eventsByChannel.get(row.channel ?? 'unknown') ?? 0) + 1);

    const metadata = row.metadata ?? {};
    const deviceClass = String(metadata.deviceClass ?? 'unknown');
    const countryCode = String(metadata.countryCode ?? 'unknown');
    const sessionKey = row.session_id ?? `event:${row.created_at}:${row.event_type}`;
    const deviceSet = sessionsByDevice.get(deviceClass) ?? new Set<string>();
    deviceSet.add(sessionKey);
    sessionsByDevice.set(deviceClass, deviceSet);
    const countrySet = sessionsByCountry.get(countryCode) ?? new Set<string>();
    countrySet.add(sessionKey);
    sessionsByCountry.set(countryCode, countrySet);

    const dayKey = row.created_at.slice(0, 10);
    byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + 1);

    if (row.event_type === 'scanner_started') scannerStarted += 1;
    if (row.event_type === 'scanner_completed') scannerCompleted += 1;
    if (row.event_type === 'quiz_started') quizStarted += 1;
    if (row.event_type === 'quiz_completed') quizCompleted += 1;
    if (row.event_type === 'onboarding_started') onboardingStarted += 1;
    if (row.event_type === 'onboarding_completed') onboardingCompleted += 1;
    if (row.event_type === 'practice_created') practiceCreated += 1;
    if (row.event_type === 'practice_activated') practiceActivated += 1;
  }

  const funnel = {
    scannerStarted,
    scannerCompleted,
    quizStarted,
    quizCompleted,
    onboardingStarted,
    onboardingCompleted,
    practiceCreated,
    practiceActivated,
  };

  const topPages = Array.from(pageViewsByPath.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([path, count]) => ({ path, count }));

  const eventTypeBreakdown = Array.from(eventsByType.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([eventType, count]) => ({ eventType, count }));

  const channelBreakdown = Array.from(eventsByChannel.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([channel, count]) => ({ channel, count }));

  const deviceBreakdown = Array.from(sessionsByDevice.entries())
    .sort((a, b) => b[1].size - a[1].size)
    .map(([device, sessionIds]) => ({ device, sessions: sessionIds.size }));

  const geoBreakdown = Array.from(sessionsByCountry.entries())
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 20)
    .map(([countryCode, sessionIds]) => ({ countryCode, sessions: sessionIds.size }));

  const eventsTimeline = Array.from(byDay.entries())
    .sort((a, b) => (a[0] > b[0] ? 1 : -1))
    .map(([day, count]) => ({ day, count }));

  return NextResponse.json({
    ok: true,
    windowDays: days,
    notice: null,
    totals: {
      events: rows.length,
      sessions: sessions.size,
      actors: actorSet.size,
    },
    funnel,
    topPages,
    eventTypeBreakdown,
    channelBreakdown,
    deviceBreakdown,
    geoBreakdown,
    eventsTimeline,
  });
}
