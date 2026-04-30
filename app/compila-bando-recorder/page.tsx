'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type RecorderSession = {
  sessionId: string;
  connectUrl: string;
  liveViewUrl: string;
  sessionExpiresAt: string | null;
};

type RemoteScreenshot = {
  ok: true;
  mimeType: string;
  data: string; // base64
  meta: { url: string; width: number; height: number; dpr: number };
};

type RemoteInspect = {
  ok: true;
  meta: { url: string; width: number; height: number; dpr: number; scrollX: number; scrollY: number };
  target: {
    tag?: string;
    id?: string;
    name?: string;
    role?: string;
    inputType?: string;
    placeholder?: string;
    label?: string;
    text?: string;
    css?: string;
    xpath?: string;
  } | null;
};

type FlowStep = any;

function nowId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
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
  const [bandoKey, setBandoKey] = useState('resto-al-sud-2-0');
  const [proceduraKey, setProceduraKey] = useState<'voucher' | 'piano-impresa'>('voucher');
  const [startUrl, setStartUrl] = useState('https://presentazione-domanda-pia.npi.invitalia.it/info-privacy');

  const [session, setSession] = useState<RecorderSession | null>(null);
  const [status, setStatus] = useState<string>('Pronto');
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgMeta, setImgMeta] = useState<RemoteScreenshot['meta'] | null>(null);
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});

  const [typeText, setTypeText] = useState('');
  const [gotoUrl, setGotoUrl] = useState('');

  const imgRef = useRef<HTMLImageElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const pollingRef = useRef<number | null>(null);

  const flowName = useMemo(() => {
    const dt = new Date();
    const stamp = dt.toISOString().slice(0, 10);
    return `Invitalia Recorder ${bandoKey}/${proceduraKey} ${stamp}`;
  }, [bandoKey, proceduraKey]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) window.clearInterval(pollingRef.current);
    pollingRef.current = null;
  }, []);

  const fetchScreenshot = useCallback(async () => {
    if (!session) return;
    const res = await fetch('/api/compila-bando/remote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'screenshot', sessionId: session.sessionId }),
    });
    const json = (await res.json()) as RemoteScreenshot | { ok: false; error: string };
    if (!('ok' in json) || !json.ok) return;
    setImgMeta(json.meta);
    setImgSrc(`data:${json.mimeType};base64,${json.data}`);
  }, [session]);

  const startPolling = useCallback(() => {
    stopPolling();
    void fetchScreenshot();
    pollingRef.current = window.setInterval(() => void fetchScreenshot(), 900);
  }, [fetchScreenshot, stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const startSession = useCallback(async () => {
    setStatus('Creo sessione Browserbase...');
    setImgSrc(null);
    setImgMeta(null);
    setSteps([]);
    setFieldMapping({});
    stopPolling();

    const res = await fetch('/api/compila-bando/recorder/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startUrl }),
    });
    const json = (await res.json()) as { ok: true; session: RecorderSession } | { ok: false; error: string };
    if (!json.ok) {
      setStatus(`Errore: ${json.error}`);
      return;
    }
    setSession(json.session);
    setStatus('Sessione pronta. Apri SPID nel browser remoto e inizia a registrare.');
    startPolling();
  }, [startUrl, startPolling, stopPolling]);

  const getMappedPoint = useCallback(
    (clientX: number, clientY: number) => {
      const img = imgRef.current;
      const box = boxRef.current;
      if (!img || !box || !imgMeta) return null;

      const r = box.getBoundingClientRect();
      const bw = r.width;
      const bh = r.height;
      const iw = imgMeta.width;
      const ih = imgMeta.height;
      if (bw <= 0 || bh <= 0 || iw <= 0 || ih <= 0) return null;

      // object-fit: contain mapping (letterbox-aware)
      const scale = Math.min(bw / iw, bh / ih);
      const rw = iw * scale;
      const rh = ih * scale;
      const ox = (bw - rw) / 2;
      const oy = (bh - rh) / 2;

      const xIn = clientX - r.left - ox;
      const yIn = clientY - r.top - oy;
      if (xIn < 0 || yIn < 0 || xIn > rw || yIn > rh) return null;

      const x = Math.round((xIn / rw) * iw);
      const y = Math.round((yIn / rh) * ih);

      return { x, y, xRatio: x / iw, yRatio: y / ih, width: iw, height: ih };
    },
    [imgMeta]
  );

  const recordClick = useCallback(
    async (x: number, y: number, xRatio: number, yRatio: number) => {
      if (!session) return;
      const res = await fetch('/api/compila-bando/remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'inspect', sessionId: session.sessionId, x, y }),
      });
      const json = (await res.json()) as RemoteInspect | { ok: false; error: string };
      if (!('ok' in json) || !json.ok) return;

      // Perform the actual click after introspection (so we record the intended target)
      await fetch('/api/compila-bando/remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'click', sessionId: session.sessionId, x, y }),
      }).catch(() => undefined);

      const step: FlowStep = {
        type: 'click',
        actionKind: 'click_only',
        stepId: nowId('rec_click'),
        pageKey: json.meta.url,
        viewport: { width: json.meta.width, height: json.meta.height, scrollX: json.meta.scrollX, scrollY: json.meta.scrollY },
        clickPoint: { xRatio, yRatio },
        target: json.target || undefined,
        reviewRequired: true,
        confirmationStatus: 'recorded',
      };

      setSteps((prev) => [...prev, step]);
      setStatus(`Registrato click su ${json.target?.id || json.target?.css || json.target?.label || json.target?.tag || 'elemento'}`);
      void fetchScreenshot();
    },
    [fetchScreenshot, session]
  );

  const onBoxPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const mapped = getMappedPoint(e.clientX, e.clientY);
      if (!mapped) return;
      void recordClick(mapped.x, mapped.y, mapped.xRatio, mapped.yRatio);
    },
    [getMappedPoint, recordClick]
  );

  const recordScroll = useCallback(
    async (deltaY: number) => {
      if (!session || !imgMeta) return;
      await fetch('/api/compila-bando/remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scroll', sessionId: session.sessionId, deltaY }),
      }).catch(() => undefined);

      const step: FlowStep = {
        type: 'scroll',
        direction: deltaY < 0 ? 'up' : 'down',
        amount: Math.abs(deltaY),
        actionKind: 'scroll',
        stepId: nowId('rec_scroll'),
        pageKey: imgMeta?.url || '',
        viewport: { width: imgMeta.width, height: imgMeta.height, scrollX: 0, scrollY: 0 },
        reviewRequired: true,
        confirmationStatus: 'recorded',
      };
      setSteps((prev) => [...prev, step]);
      setStatus(`Registrato scroll ${deltaY}px`);
      void fetchScreenshot();
    },
    [fetchScreenshot, imgMeta, session]
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!session) return;
      e.preventDefault();
      const deltaY = Math.max(-1200, Math.min(1200, Math.round(e.deltaY)));
      if (deltaY === 0) return;
      void recordScroll(deltaY);
    },
    [recordScroll, session]
  );

  const recordType = useCallback(
    async () => {
      if (!session) return;
      const text = typeText.trim();
      if (!text) return;

      const inspectRes = await fetch('/api/compila-bando/remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'active-element', sessionId: session.sessionId }),
      });
      const inspected = (await inspectRes.json()) as RemoteInspect | { ok: false; error: string };
      if (!('ok' in inspected) || !inspected.ok) return;

      await fetch('/api/compila-bando/remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'type', sessionId: session.sessionId, text, delayMs: 6 }),
      }).catch(() => undefined);

      const valueKey = `recorded.${Date.now()}`;
      setFieldMapping((prev) => ({ ...prev, [valueKey]: text }));

      const step: FlowStep = {
        type: 'type',
        actionKind: 'type',
        stepId: nowId('rec_type'),
        pageKey: inspected.meta.url,
        viewport: { width: inspected.meta.width, height: inspected.meta.height, scrollX: inspected.meta.scrollX, scrollY: inspected.meta.scrollY },
        target: inspected.target || undefined,
        valueFrom: valueKey,
        reviewRequired: true,
        confirmationStatus: 'recorded',
      };
      setSteps((prev) => [...prev, step]);
      setTypeText('');
      setStatus(`Registrato type: ${inspected.target?.id || inspected.target?.label || 'campo'} = "${text}"`);
      void fetchScreenshot();
    },
    [fetchScreenshot, session, typeText]
  );

  const recordGoto = useCallback(
    async () => {
      if (!session) return;
      const url = (gotoUrl || '').trim();
      if (!url) return;
      await fetch('/api/compila-bando/remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'goto', sessionId: session.sessionId, url }),
      }).catch(() => undefined);
      const step: FlowStep = {
        type: 'goto',
        url,
        waitUntil: 'domcontentloaded',
        actionKind: 'goto',
        stepId: nowId('rec_goto'),
        reviewRequired: true,
        confirmationStatus: 'recorded',
        viewport: imgMeta ? { width: imgMeta.width, height: imgMeta.height, scrollX: 0, scrollY: 0 } : undefined,
      };
      setSteps((prev) => [...prev, step]);
      setGotoUrl('');
      setStatus(`Registrato goto: ${url}`);
      void fetchScreenshot();
    },
    [fetchScreenshot, gotoUrl, imgMeta, session]
  );

  const exportFlow = useCallback(() => {
    const flow = {
      name: flowName,
      version: 1,
      source: 'recorder',
      updatedAt: new Date().toISOString().slice(0, 10),
      bandoKey,
      proceduraKey,
      domain: 'invitalia-areariservata-fe.npi.invitalia.it',
      saveMode: 'new_version',
      status: 'active',
      requiresFinalConfirmation: true,
      expectedDurationSeconds: 320,
      fieldMapping,
      steps,
    };
    downloadJson(flow, `${bandoKey}-${proceduraKey}-flow.json`);
    setStatus('Flow esportato (download).');
  }, [bandoKey, fieldMapping, flowName, proceduraKey, steps]);

  return (
    <main style={{ padding: 18, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 900 }}>Compila Bando Recorder (solo interno)</h1>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
        Registra il flow manualmente (click/type/scroll/goto) su Invitalia tramite Browserbase e scarica il JSON.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 14, alignItems: 'start' }}>
        <div>
          <div
            ref={boxRef}
            onPointerDown={onBoxPointerDown}
            onWheel={onWheel}
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              background: '#0b1136',
              height: 640,
              overflow: 'hidden',
              position: 'relative',
              userSelect: 'none',
              touchAction: 'none',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {imgSrc ? (
              <img
                ref={imgRef}
                src={imgSrc}
                alt="remote"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                draggable={false}
              />
            ) : (
              <div style={{ color: '#cbd5e1', fontSize: 12 }}>Nessuna immagine (avvia sessione)</div>
            )}

            <div style={{ position: 'absolute', left: 12, top: 10, color: '#cbd5e1', fontSize: 11 }}>
              {imgMeta?.url ? imgMeta.url : '—'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button onClick={() => void fetchScreenshot()} type="button" style={{ padding: '8px 10px' }}>
              Aggiorna
            </button>
            <button onClick={() => startPolling()} type="button" style={{ padding: '8px 10px' }}>
              Live
            </button>
            <button onClick={() => stopPolling()} type="button" style={{ padding: '8px 10px' }}>
              Pausa
            </button>
            <button onClick={exportFlow} type="button" style={{ padding: '8px 10px' }}>
              Scarica JSON
            </button>
          </div>
        </div>

        <aside style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, background: '#fff' }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Stato</div>
          <div style={{ fontSize: 12, color: '#334155', marginBottom: 12 }}>{status}</div>

          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              bandoKey
              <input value={bandoKey} onChange={(e) => setBandoKey(e.target.value)} style={{ padding: 8, border: '1px solid #cbd5e1', borderRadius: 10 }} />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              proceduraKey
              <select value={proceduraKey} onChange={(e) => setProceduraKey(e.target.value as any)} style={{ padding: 8, border: '1px solid #cbd5e1', borderRadius: 10 }}>
                <option value="voucher">voucher</option>
                <option value="piano-impresa">piano-impresa</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              startUrl
              <input value={startUrl} onChange={(e) => setStartUrl(e.target.value)} style={{ padding: 8, border: '1px solid #cbd5e1', borderRadius: 10 }} />
            </label>
          </div>

          <button onClick={() => void startSession()} type="button" style={{ width: '100%', padding: '10px 12px' }}>
            Avvia sessione
          </button>

          <hr style={{ margin: '14px 0', borderColor: '#e2e8f0' }} />

          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Azioni</div>

          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              Goto URL
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={gotoUrl} onChange={(e) => setGotoUrl(e.target.value)} style={{ flex: 1, padding: 8, border: '1px solid #cbd5e1', borderRadius: 10 }} />
                <button onClick={() => void recordGoto()} type="button" style={{ padding: '8px 10px' }}>
                  Goto
                </button>
              </div>
            </label>

            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              Type (sul campo attivo)
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={typeText} onChange={(e) => setTypeText(e.target.value)} style={{ flex: 1, padding: 8, border: '1px solid #cbd5e1', borderRadius: 10 }} />
                <button onClick={() => void recordType()} type="button" style={{ padding: '8px 10px' }}>
                  Type
                </button>
              </div>
            </label>

            <div style={{ fontSize: 12, color: '#475569' }}>
              Click sul mirror per registrare click. Scroll con mouse wheel sul mirror per registrare scroll.
            </div>
          </div>

          <hr style={{ margin: '14px 0', borderColor: '#e2e8f0' }} />

          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
            Steps registrati: {steps.length}
          </div>
          <div style={{ maxHeight: 260, overflow: 'auto', fontSize: 11, color: '#334155', lineHeight: 1.45 }}>
            {steps.slice(-16).map((s, i) => (
              <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                <strong>{s.type}</strong> {s.target?.id ? `#${s.target.id}` : s.target?.label ? s.target.label : s.url ? s.url : ''}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {session && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#475569' }}>
          Session: <code>{session.sessionId}</code> {session.sessionExpiresAt ? ` (scade: ${session.sessionExpiresAt})` : ''}
        </div>
      )}
    </main>
  );
}

