'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type ScreenshotPayload =
  | { ok: true; mimeType: string; data: string; meta: { url: string; width: number; height: number; dpr: number } }
  | { ok: false; error: string };

type SessionStatusPayload =
  | { ok: true; url: string; loggedIn: boolean; hint: string; lastSeenAt?: string | null }
  | { ok: false; error: string };

function useQueryParam(name: string): string {
  const [value, setValue] = useState('');
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setValue(params.get(name) || '');
    } catch {
      setValue('');
    }
  }, [name]);
  return value;
}

export default function SpidLoginPopupPage() {
  const sessionId = useQueryParam('sessionId');
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ url: string; width: number; height: number; dpr: number } | null>(null);
  const [status, setStatus] = useState<string>('Caricamento...');
  const [text, setText] = useState('');
  const pollingRef = useRef<number | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const canInteract = Boolean(sessionId);

  const stop = useCallback(() => {
    if (pollingRef.current) window.clearInterval(pollingRef.current);
    pollingRef.current = null;
  }, []);

  const fetchShot = useCallback(async () => {
    if (!sessionId) return;
    const res = await fetch('/api/compila-bando/remote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'screenshot', sessionId }),
    });
    const json = (await res.json()) as ScreenshotPayload;
    if (!json.ok) {
      setStatus(`Errore screenshot: ${json.error}`);
      return;
    }
    setMeta(json.meta);
    setImgSrc(`data:${json.mimeType};base64,${json.data}`);
    setStatus('Connesso');
  }, [sessionId]);

  const tickStatus = useCallback(async () => {
    if (!sessionId) return;
    const res = await fetch('/api/compila-bando/session-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    const json = (await res.json()) as SessionStatusPayload;
    if (json.ok && json.loggedIn) {
      // Switch to same-origin page that will self-close.
      window.location.replace('/spid-done');
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setStatus('sessionId mancante');
      return;
    }
    void fetchShot();
    void tickStatus();
    stop();
    pollingRef.current = window.setInterval(() => {
      void fetchShot();
    }, 850);
    const statusTimer = window.setInterval(() => void tickStatus(), 2000);
    return () => {
      stop();
      window.clearInterval(statusTimer);
    };
  }, [fetchShot, sessionId, stop, tickStatus]);

  const mapPoint = useCallback(
    (clientX: number, clientY: number) => {
      const box = boxRef.current;
      if (!box || !meta) return null;
      const r = box.getBoundingClientRect();
      const bw = r.width;
      const bh = r.height;
      const iw = meta.width;
      const ih = meta.height;
      if (bw <= 0 || bh <= 0 || iw <= 0 || ih <= 0) return null;

      // object-fit contain
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
      return { x, y };
    },
    [meta]
  );

  const clickAt = useCallback(
    async (x: number, y: number) => {
      if (!sessionId) return;
      await fetch('/api/compila-bando/remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'click', sessionId, x, y }),
      }).catch(() => undefined);
      void fetchShot();
    },
    [fetchShot, sessionId]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const pt = mapPoint(e.clientX, e.clientY);
      if (!pt) return;
      void clickAt(pt.x, pt.y);
    },
    [clickAt, mapPoint]
  );

  const pressKey = useCallback(
    async (key: string) => {
      if (!sessionId) return;
      await fetch('/api/compila-bando/remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'press', sessionId, key }),
      }).catch(() => undefined);
      void fetchShot();
    },
    [fetchShot, sessionId]
  );

  const sendText = useCallback(async () => {
    const t = text.trim();
    if (!sessionId || !t) return;
    await fetch('/api/compila-bando/remote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'type', sessionId, text: t, delayMs: 4 }),
    }).catch(() => undefined);
    setText('');
    void fetchShot();
  }, [fetchShot, sessionId, text]);

  const title = useMemo(() => 'BNDO SPID', []);

  return (
    <main style={{ height: '100vh', display: 'grid', gridTemplateRows: 'auto 1fr auto', background: '#0b1136' }}>
      <header style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: 999, background: canInteract ? '#22c55e' : '#ef4444' }} />
          <div style={{ color: '#fff', fontWeight: 900, fontSize: 13 }}>{title}</div>
          <div style={{ color: 'rgba(226,232,240,0.9)', fontSize: 11 }}>{status}</div>
        </div>
        <div style={{ color: 'rgba(226,232,240,0.75)', fontSize: 10, maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meta?.url || '—'}
        </div>
      </header>

      <div
        ref={boxRef}
        onPointerDown={onPointerDown}
        style={{
          margin: 10,
          borderRadius: 12,
          border: '1px solid rgba(148,163,184,0.28)',
          overflow: 'hidden',
          background: '#020617',
          display: 'grid',
          placeItems: 'center',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        {imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgSrc} alt="spid" style={{ width: '100%', height: '100%', objectFit: 'contain' }} draggable={false} />
        ) : (
          <div style={{ color: '#cbd5e1', fontSize: 12, padding: 12 }}>Caricamento...</div>
        )}
      </div>

      <footer style={{ padding: 10, display: 'grid', gap: 8, background: 'rgba(2,6,23,0.45)', borderTop: '1px solid rgba(148,163,184,0.18)' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => void pressKey('Tab')} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.3)', background: 'rgba(15,23,42,0.75)', color: '#fff', fontSize: 12 }}>
            TAB
          </button>
          <button onClick={() => void pressKey('Enter')} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.3)', background: 'rgba(15,23,42,0.75)', color: '#fff', fontSize: 12 }}>
            INVIO
          </button>
          <button onClick={() => void pressKey('Backspace')} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.3)', background: 'rgba(15,23,42,0.75)', color: '#fff', fontSize: 12 }}>
            BACK
          </button>
          <button onClick={() => void fetchShot()} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.3)', background: 'rgba(15,23,42,0.75)', color: '#fff', fontSize: 12 }}>
            Aggiorna
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Scrivi qui e invia alla sessione..."
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,0.25)',
              background: 'rgba(15,23,42,0.75)',
              color: '#fff',
              fontSize: 12,
              outline: 'none',
            }}
          />
          <button
            onClick={() => void sendText()}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid rgba(34,197,94,0.45)',
              background: 'rgba(34,197,94,0.22)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 900,
              cursor: 'pointer',
              minWidth: 92,
            }}
          >
            Invia
          </button>
        </div>
      </footer>
    </main>
  );
}

