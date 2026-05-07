import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RecorderEvent = Record<string, unknown> & { recordingId?: string; ts?: number };

type Store = {
  createdAt: number;
  updatedAt: number;
  events: RecorderEvent[];
};

const STORE_TTL_MS = 30 * 60 * 1000;
const MAX_EVENTS = 2500;

function getStoreMap(): Map<string, Store> {
  const g = globalThis as any;
  if (!g.__bndo_recorder_store) g.__bndo_recorder_store = new Map<string, Store>();
  return g.__bndo_recorder_store as Map<string, Store>;
}

function cleanupStore() {
  const m = getStoreMap();
  const now = Date.now();
  for (const [key, store] of m.entries()) {
    if (now - store.updatedAt > STORE_TTL_MS) m.delete(key);
  }
}

function corsHeaders(origin?: string | null) {
  // Recorder events come from 3rd-party origins (Invitalia) inside the remote browser.
  // Allow * to simplify; payload is not user secrets (we only store short samples).
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
  };
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get('origin');
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
  cleanupStore();
  const origin = req.headers.get('origin');

  try {
    const event = (await req.json().catch(() => null)) as RecorderEvent | null;
    const safeEvent: RecorderEvent = event ?? {};
    const recordingIdRaw = (event && typeof event.recordingId === 'string' ? event.recordingId : '').trim();
    const recordingId = recordingIdRaw || '';
    if (!recordingId) {
      return NextResponse.json({ ok: false, error: 'recordingId richiesto' }, { status: 400, headers: corsHeaders(origin) });
    }

    const storeMap = getStoreMap();
    const now = Date.now();
    const store = storeMap.get(recordingId) ?? { createdAt: now, updatedAt: now, events: [] };
    store.updatedAt = now;
    if (store.events.length < MAX_EVENTS) {
      store.events.push({ ...safeEvent, ts: typeof safeEvent.ts === 'number' ? safeEvent.ts : now });
    }
    storeMap.set(recordingId, store);

    return NextResponse.json({ ok: true }, { headers: corsHeaders(origin) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Errore recorder event' },
      { status: 500, headers: corsHeaders(origin) }
    );
  }
}
