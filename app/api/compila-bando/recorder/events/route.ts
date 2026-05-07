import { NextResponse } from 'next/server';
import { browserbaseReady, createBrowserbaseClient, validateBrowserbaseEnv } from '@/lib/copilot/browserbase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RecorderEvent = Record<string, unknown> & { ts?: number };

type Store = {
  createdAt: number;
  updatedAt: number;
  events: RecorderEvent[];
};

const STORE_TTL_MS = 30 * 60 * 1000;
const LOG_PREFIX = 'BNDO_RECORDER_EVENT:';

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

function normalizeString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function extractRecorderEventsFromBrowserbaseLogs(rawLogs: unknown, recordingId: string) {
  const logs = Array.isArray(rawLogs) ? rawLogs : [];
  const events: RecorderEvent[] = [];

  const tryParseLine = (line: string, fallbackTs?: number) => {
    const idx = line.indexOf(LOG_PREFIX);
    if (idx < 0) return;
    const jsonStr = line.slice(idx + LOG_PREFIX.length);
    try {
      const parsed = JSON.parse(jsonStr) as RecorderEvent;
      if (!parsed || typeof parsed !== 'object') return;
      const rid = typeof (parsed as any).recordingId === 'string' ? String((parsed as any).recordingId).trim() : '';
      if (!rid || rid !== recordingId) return;
      const ts = typeof parsed.ts === 'number' ? parsed.ts : fallbackTs;
      events.push({ ...parsed, ...(ts ? { ts } : {}) });
    } catch {
      // ignore
    }
  };

  for (const entry of logs as any[]) {
    const method = normalizeString(entry?.method);
    const tsMaybe =
      (typeof entry?.timestamp === 'number' ? entry.timestamp : null) ??
      (typeof entry?.ts === 'number' ? entry.ts : null) ??
      null;
    const fallbackTs = tsMaybe ? Math.floor(tsMaybe) : undefined;

    const params = (entry?.request && typeof entry.request === 'object' ? (entry.request as any).params : null) ?? null;
    const resp = (entry?.response && typeof entry.response === 'object' ? (entry.response as any).result : null) ?? null;

    // Common CDP shapes:
    // - Runtime.consoleAPICalled: request.params.args[].value
    // - Log.entryAdded: request.params.entry.text
    if (params && typeof params === 'object') {
      const args = Array.isArray((params as any).args) ? (params as any).args : [];
      for (const a of args) {
        const value = normalizeString(a?.value);
        if (value) tryParseLine(value, fallbackTs);
      }
      const text = normalizeString((params as any).text);
      if (text) tryParseLine(text, fallbackTs);
      const entryText = normalizeString((params as any)?.entry?.text);
      if (entryText) tryParseLine(entryText, fallbackTs);
      const msgText = normalizeString((params as any)?.message?.text);
      if (msgText) tryParseLine(msgText, fallbackTs);
    }

    // Some SDKs store console message inside response.result.* (best effort).
    if (resp && typeof resp === 'object') {
      const text = normalizeString((resp as any).text);
      if (text) tryParseLine(text, fallbackTs);
      const value = normalizeString((resp as any).value);
      if (value) tryParseLine(value, fallbackTs);
      const msg = normalizeString((resp as any)?.message?.text);
      if (msg) tryParseLine(msg, fallbackTs);
    }

    // As last resort, scan stringified entry (slow, but only when method is console-related).
    if (method && /console|log/i.test(method)) {
      try {
        const s = JSON.stringify(entry);
        if (s.includes(LOG_PREFIX)) tryParseLine(s, fallbackTs);
      } catch {
        // ignore
      }
    }
  }

  // Ensure stable order
  events.sort((a, b) => (typeof a.ts === 'number' ? a.ts : 0) - (typeof b.ts === 'number' ? b.ts : 0));
  return events;
}

export async function GET(req: Request) {
  cleanupStore();
  const url = new URL(req.url);
  const recordingId = isNonEmptyString(url.searchParams.get('recordingId'))
    ? url.searchParams.get('recordingId')!.trim()
    : '';
  const sessionId = isNonEmptyString(url.searchParams.get('sessionId'))
    ? url.searchParams.get('sessionId')!.trim()
    : '';

  // Prefer Browserbase session logs (durable across serverless instances / Netlify previews).
  if (sessionId) {
    if (!recordingId) {
      return NextResponse.json({ ok: false, error: 'recordingId richiesto (con sessionId)' }, { status: 400 });
    }
    if (!browserbaseReady()) {
      return NextResponse.json({ ok: false, error: 'Browserbase non configurato' }, { status: 400 });
    }
    const env = validateBrowserbaseEnv();
    if (!env.ok) {
      return NextResponse.json({ ok: false, error: env.errors.join(' ') }, { status: 400 });
    }

    const bb = await createBrowserbaseClient();
    const listFn = (bb as any).sessions?.logs?.list;
    if (typeof listFn !== 'function') {
      // SDK older than our expected surface. Fall back to memory store (best-effort).
      const store = getStoreMap().get(recordingId);
      return NextResponse.json({
        ok: true,
        recordingId,
        sessionId,
        events: store?.events ?? [],
        createdAt: store?.createdAt ?? null,
        updatedAt: store?.updatedAt ?? null,
        source: 'memory_fallback_sdk_no_logs',
      });
    }

    const logs = await listFn(sessionId);
    const events = extractRecorderEventsFromBrowserbaseLogs(logs, recordingId);
    return NextResponse.json({
      ok: true,
      recordingId,
      sessionId,
      events,
      source: 'browserbase_logs',
    });
  }

  // Fallback: legacy in-memory store (works locally; not reliable on Netlify).
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
    source: 'memory',
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
