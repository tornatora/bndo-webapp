'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type RecorderSession = {
  sessionId: string;
  connectUrl: string;
  liveViewUrl: string;
  sessionExpiresAt: string | null;
};

type FlowStep = any;

function nowId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

function slugify(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function downloadJson(obj: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function CompilaBandoRecorderPage() {
  const [bandoName, setBandoName] = useState('Resto al Sud 2.0');
  const bandoKey = useMemo(() => slugify(bandoName) || 'bando', [bandoName]);
  const [proceduraKey, setProceduraKey] = useState<string>('voucher');
  const [subProceduraKey, setSubProceduraKey] = useState<string>('');
  const [startUrl, setStartUrl] = useState('https://presentazione-domanda-pia.npi.invitalia.it/info-privacy');

  const [session, setSession] = useState<RecorderSession | null>(null);
  const [recordingId, setRecordingId] = useState<string>('');
  const [status, setStatus] = useState<string>('Pronto');
  const [eventsCount, setEventsCount] = useState<number>(0);
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});

  const installTimerRef = useRef<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const lastEventCountRef = useRef<number>(0);

  const flowName = useMemo(() => {
    const dt = new Date();
    const stamp = dt.toISOString().slice(0, 10);
    const sub = subProceduraKey.trim() ? `/${slugify(subProceduraKey)}` : '';
    return `Invitalia Recorder ${bandoKey}/${slugify(proceduraKey)}${sub} ${stamp}`;
  }, [bandoKey, proceduraKey, subProceduraKey]);

  useEffect(() => {
    return () => {
      if (installTimerRef.current) window.clearInterval(installTimerRef.current);
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      installTimerRef.current = null;
      pollTimerRef.current = null;
    };
  }, []);

  const startSession = useCallback(async () => {
    setStatus('Creo sessione Browserbase...');
    setSession(null);
    setRecordingId('');
    setEventsCount(0);
    setSteps([]);
    setFieldMapping({});
    lastEventCountRef.current = 0;

    if (installTimerRef.current) window.clearInterval(installTimerRef.current);
    if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    installTimerRef.current = null;
    pollTimerRef.current = null;

    const res = await fetch('/api/compila-bando/recorder/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startUrl }),
    });
    const json = (await res.json().catch(() => null)) as
      | { ok: true; session: RecorderSession }
      | { ok: false; error: string }
      | null;

    if (!json || !('ok' in json) || !json.ok) {
      setStatus(`Errore: ${(json as any)?.error || 'start recorder non disponibile'}`);
      return;
    }

    setSession(json.session);
    const rid = nowId('rec');
    setRecordingId(rid);
    setStatus('Sessione pronta. Interagisci nel Live View: click/type/select/goto vengono registrati automaticamente.');
  }, [startUrl]);

  const installRecorder = useCallback(async () => {
    if (!session || !recordingId) return;
    await fetch('/api/compila-bando/recorder/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.sessionId, recordingId, appOrigin: window.location.origin }),
    }).catch(() => undefined);
  }, [recordingId, session]);

  const pollEvents = useCallback(async () => {
    if (!recordingId) return;
    const res = await fetch(`/api/compila-bando/recorder/events?recordingId=${encodeURIComponent(recordingId)}`).catch(() => null);
    if (!res || !res.ok) return;
    const json = (await res.json().catch(() => null)) as any;
    const events: any[] = Array.isArray(json?.events) ? json.events : [];
    setEventsCount(events.length);
    if (events.length <= lastEventCountRef.current) return;

    // Convert only new events to steps.
    const fresh = events.slice(lastEventCountRef.current);
    lastEventCountRef.current = events.length;

    const newSteps: FlowStep[] = [];
    for (const ev of fresh) {
      if (!ev || typeof ev !== 'object') continue;
      const t = String(ev.type || '');
      if (!t || t === 'recorder_ready') continue;

      if (t === 'goto') {
        const url = String(ev.href || ev.url || '');
        if (!url) continue;
        newSteps.push({
          type: 'goto',
          actionKind: 'goto',
          stepId: nowId('rec_goto'),
          pageKey: url,
          url,
          waitUntil: 'domcontentloaded',
          reviewRequired: true,
          confirmationStatus: 'recorded',
        });
        continue;
      }

      if (t === 'click') {
        newSteps.push({
          type: 'click',
          actionKind: 'click_only',
          stepId: nowId('rec_click'),
          pageKey: String(ev.url || ''),
          target: {
            css: ev.selector || '',
            id: ev.id || '',
            name: ev.name || '',
            role: ev.role || '',
            label: ev.label || '',
            text: ev.text || '',
            tag: ev.tag || '',
          },
          reviewRequired: true,
          confirmationStatus: 'recorded',
        });
        continue;
      }

      if (t === 'type' || t === 'select') {
        const valueSample = String(ev.valueSample || '').trim();
        const valueKey = valueSample ? `recorded.${Date.now()}` : '';
        if (valueKey) setFieldMapping((prev) => ({ ...prev, [valueKey]: valueSample }));
        newSteps.push({
          type: t,
          actionKind: t === 'select' ? 'select' : 'type',
          stepId: nowId(`rec_${t}`),
          pageKey: String(ev.url || ''),
          target: {
            css: ev.selector || '',
            id: ev.id || '',
            name: ev.name || '',
            label: ev.label || '',
            inputType: ev.inputType || '',
            tag: ev.tag || '',
          },
          ...(valueKey ? { valueFrom: valueKey } : { valueLen: ev.valueLen || 0 }),
          reviewRequired: true,
          confirmationStatus: 'recorded',
        });
        continue;
      }

      if (t === 'scroll') {
        const scrollTop = typeof ev.scrollTop === 'number' ? ev.scrollTop : null;
        const scrollLeft = typeof ev.scrollLeft === 'number' ? ev.scrollLeft : null;
        const scrollHeight = typeof ev.scrollHeight === 'number' ? ev.scrollHeight : null;
        const clientHeight = typeof ev.clientHeight === 'number' ? ev.clientHeight : null;
        const isScrollable = scrollHeight !== null && clientHeight !== null ? scrollHeight > clientHeight + 2 : true;
        if (!isScrollable) continue;
        if (scrollTop === null || !Number.isFinite(scrollTop) || scrollTop <= 0) continue;

        const selector = String(ev.selector || '').trim();
        const target = selector
          ? {
              css: selector,
              id: ev.id || '',
              label: ev.label || '',
              tag: ev.tag || '',
            }
          : undefined;

        newSteps.push({
          type: 'scroll',
          actionKind: 'scroll',
          stepId: nowId('rec_scroll'),
          pageKey: String(ev.url || ''),
          ...(target ? { target } : {}),
          viewport: {
            scrollY: Math.max(0, Math.floor(scrollTop)),
            ...(scrollLeft !== null && Number.isFinite(scrollLeft) ? { scrollX: Math.max(0, Math.floor(scrollLeft)) } : {}),
          },
          reviewRequired: true,
          confirmationStatus: 'recorded',
        });
      }
    }

    if (newSteps.length > 0) {
      setSteps((prev) => [...prev, ...newSteps]);
      setStatus(`Registrazione attiva: ${events.length} eventi`);
    }
  }, [recordingId]);

  useEffect(() => {
    if (!session || !recordingId) return;
    void installRecorder();
    void pollEvents();

    if (installTimerRef.current) window.clearInterval(installTimerRef.current);
    installTimerRef.current = window.setInterval(() => void installRecorder(), 3000);

    if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    pollTimerRef.current = window.setInterval(() => void pollEvents(), 900);

    return () => {
      if (installTimerRef.current) window.clearInterval(installTimerRef.current);
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      installTimerRef.current = null;
      pollTimerRef.current = null;
    };
  }, [installRecorder, pollEvents, recordingId, session]);

  const exportFlow = useCallback(() => {
    const proceduraSlug = slugify(proceduraKey) || 'procedura';
    const subSlug = subProceduraKey.trim() ? slugify(subProceduraKey) : '';
    const flow = {
      name: flowName,
      version: 1,
      source: 'recorder',
      updatedAt: new Date().toISOString().slice(0, 10),
      bandoKey,
      bandoName,
      proceduraKey: proceduraSlug,
      ...(subSlug ? { subProceduraKey: subSlug } : {}),
      // NB: il flow runtime fa selector-resolve robusto; qui registriamo solo target best-effort.
      expectedDurationSeconds: 320,
      fieldMapping,
      steps,
    };
    downloadJson(flow, `${bandoKey}-${proceduraSlug}${subSlug ? `-${subSlug}` : ''}-flow.json`);
    setStatus('Flow esportato (download).');
  }, [bandoKey, bandoName, fieldMapping, flowName, proceduraKey, steps, subProceduraKey]);

  return (
    <main style={{ padding: 18, maxWidth: 1280, margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 900 }}>Compila Bando Recorder (solo interno)</h1>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
        Live View reale (fluido) + registrazione automatica click/type/select/scroll/goto dentro la sessione Browserbase.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 14, alignItems: 'start' }}>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#0b1136', overflow: 'hidden' }}>
          {session ? (
            <iframe
              src={session.liveViewUrl}
              title="Browserbase Live View"
              style={{ width: '100%', height: 760, border: 0, background: '#0b1136' }}
              allow="clipboard-read; clipboard-write"
            />
          ) : (
            <div style={{ height: 760, display: 'grid', placeItems: 'center', color: '#cbd5e1', fontSize: 12 }}>
              Avvia una sessione per vedere il Live View...
            </div>
          )}
        </div>

        <aside style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, background: '#fff' }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Stato</div>
          <div style={{ fontSize: 12, color: '#334155', marginBottom: 12 }}>{status}</div>

          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              Nome Bando
              <input value={bandoName} onChange={(e) => setBandoName(e.target.value)} style={{ padding: 8, border: '1px solid #cbd5e1', borderRadius: 10 }} />
              <span style={{ fontSize: 11, color: '#64748b' }}>key: <code>{bandoKey}</code></span>
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              Procedura
              <input
                list="procedura-options"
                value={proceduraKey}
                onChange={(e) => setProceduraKey(e.target.value)}
                style={{ padding: 8, border: '1px solid #cbd5e1', borderRadius: 10 }}
              />
              <datalist id="procedura-options">
                <option value="voucher" />
                <option value="piano-impresa" />
              </datalist>
              <span style={{ fontSize: 11, color: '#64748b' }}>key: <code>{slugify(proceduraKey) || '—'}</code></span>
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              Sotto-procedura (opzionale)
              <input
                list="subprocedura-options"
                value={subProceduraKey}
                onChange={(e) => setSubProceduraKey(e.target.value)}
                placeholder="es. libero-professionista"
                style={{ padding: 8, border: '1px solid #cbd5e1', borderRadius: 10 }}
              />
              <datalist id="subprocedura-options">
                <option value="libero-professionista" />
                <option value="lavoratore-autonomo" />
              </datalist>
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              startUrl
              <input value={startUrl} onChange={(e) => setStartUrl(e.target.value)} style={{ padding: 8, border: '1px solid #cbd5e1', borderRadius: 10 }} />
            </label>
          </div>

          <button onClick={() => void startSession()} type="button" style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(15,23,42,0.14)', background: '#0b1136', color: '#fff', fontWeight: 900 }}>
            Avvia sessione
          </button>

          {session && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#334155', display: 'grid', gap: 6 }}>
              <div><strong>recordingId:</strong> {recordingId || '—'}</div>
              <div><strong>eventi:</strong> {eventsCount}</div>
              <div><strong>steps:</strong> {steps.length}</div>
              <div style={{ color: '#64748b', fontSize: 11 }}>
                session: <code>{session.sessionId}</code>{session.sessionExpiresAt ? ` (scade: ${session.sessionExpiresAt})` : ''}
              </div>
              <a href={session.liveViewUrl} target="_blank" rel="noreferrer" style={{ color: '#0b1136', fontWeight: 900, fontSize: 12 }}>
                Apri Live View in nuova scheda
              </a>
            </div>
          )}

          <hr style={{ margin: '14px 0', borderColor: '#e2e8f0' }} />

          <button onClick={exportFlow} type="button" style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(15,23,42,0.14)', background: '#111827', color: '#fff', fontWeight: 900 }}>
            Scarica JSON
          </button>

          <div style={{ marginTop: 12, fontSize: 12, fontWeight: 800 }}>Ultimi step</div>
          <div style={{ marginTop: 6, maxHeight: 300, overflow: 'auto', fontSize: 11, color: '#334155', lineHeight: 1.45 }}>
            {steps.slice(-20).map((s, i) => (
              <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                <strong>{s.type}</strong>{' '}
                {s.target?.id ? `#${s.target.id}` : s.target?.label ? s.target.label : s.url ? s.url : ''}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
