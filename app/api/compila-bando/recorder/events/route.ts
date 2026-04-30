import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RecorderEvent = Record<string, unknown> & { ts?: number };

type Store = {
  createdAt: number;
  updatedAt: number;
  events: RecorderEvent[];
};

const STORE_TTL_MS = 30 * 60 * 1000;

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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export async function GET(req: Request) {
  cleanupStore();
  const url = new URL(req.url);
  const recordingId = isNonEmptyString(url.searchParams.get('recordingId')) ? url.searchParams.get('recordingId')!.trim() : '';
  if (!recordingId) {
    return NextResponse.json({ ok: false, error: 'recordingId richiesto' }, { status: 400 });
  }

  const store = getStoreMap().get(recordingId);
  return NextResponse.json({
    ok: true,
    recordingId,
    events: store?.events ?? [],
    createdAt: store?.createdAt ?? null,
    updatedAt: store?.updatedAt ?? null,
  });
}

export async function POST(req: Request) {
  // convenience: allow clear
  cleanupStore();
  const body = (await req.json().catch(() => ({}))) as { recordingId?: unknown; action?: unknown };
  const recordingId = isNonEmptyString(body.recordingId) ? body.recordingId.trim() : '';
  const action = isNonEmptyString(body.action) ? body.action.trim() : '';
  if (!recordingId) {
    return NextResponse.json({ ok: false, error: 'recordingId richiesto' }, { status: 400 });
  }
  if (action === 'clear') {
    getStoreMap().delete(recordingId);
    return NextResponse.json({ ok: true, cleared: true });
  }
  return NextResponse.json({ ok: false, error: 'azione non supportata' }, { status: 400 });
}

