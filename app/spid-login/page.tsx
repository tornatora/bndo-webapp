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

  const title = useMemo(() => 'browser.bndo.it', []);

  return (
    <main style={{ height: '100vh', background: '#f1f5f9', padding: 12, boxSizing: 'border-box' }}>
      <div
        style={{
          height: '100%',
          borderRadius: 18,
          background: '#ffffff',
          border: '1px solid rgba(15, 23, 42, 0.10)',
          boxShadow: '0 24px 70px rgba(15, 23, 42, 0.22)',
          overflow: 'hidden',
          display: 'grid',
          gridTemplateRows: '44px 1fr 54px',
        }}
      >
        {/* Browser chrome */}
        <header
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr auto',
            alignItems: 'center',
            gap: 10,
            padding: '0 12px',
            borderBottom: '1px solid rgba(148, 163, 184, 0.35)',
            background: '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 99, background: '#ef4444', display: 'block' }} />
              <span style={{ width: 10, height: 10, borderRadius: 99, background: '#f59e0b', display: 'block' }} />
              <span style={{ width: 10, height: 10, borderRadius: 99, background: '#22c55e', display: 'block' }} />
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{status}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', alignItems: 'center' }}>
            <div
              style={{
                height: 28,
                borderRadius: 12,
                border: '1px solid rgba(148, 163, 184, 0.55)',
                background: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                padding: '0 10px',
                gap: 8,
                overflow: 'hidden',
              }}
              title={meta?.url || ''}
            >
              <div style={{ width: 16, height: 16, borderRadius: 4, background: '#0b1136', color: '#fff', fontSize: 10, display: 'grid', placeItems: 'center', fontWeight: 900 }}>
                B
              </div>
              <div style={{ fontSize: 12, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {meta?.url || '—'}
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: 11 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: canInteract ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
                {title}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: '#64748b', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {meta?.url ? new URL(meta.url).hostname : ''}
          </div>
        </header>

        {/* Remote view */}
        <div
          ref={boxRef}
          onPointerDown={onPointerDown}
          style={{
            background: '#111827',
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

        {/* Minimal controls */}
        <footer
          style={{
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderTop: '1px solid rgba(148, 163, 184, 0.35)',
            background: '#f8fafc',
          }}
        >
          <button onClick={() => void pressKey('Tab')} style={{ padding: '8px 10px', borderRadius: 12, border: '1px solid rgba(148,163,184,0.55)', background: '#fff', color: '#0f172a', fontSize: 12 }}>
            TAB
          </button>
          <button onClick={() => void pressKey('Enter')} style={{ padding: '8px 10px', borderRadius: 12, border: '1px solid rgba(148,163,184,0.55)', background: '#fff', color: '#0f172a', fontSize: 12 }}>
            INVIO
          </button>
          <button onClick={() => void pressKey('Backspace')} style={{ padding: '8px 10px', borderRadius: 12, border: '1px solid rgba(148,163,184,0.55)', background: '#fff', color: '#0f172a', fontSize: 12 }}>
            BACK
          </button>
          <button onClick={() => void fetchShot()} style={{ padding: '8px 10px', borderRadius: 12, border: '1px solid rgba(148,163,184,0.55)', background: '#fff', color: '#0f172a', fontSize: 12 }}>
            Aggiorna
          </button>

          <div style={{ flex: 1 }} />

          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Scrivi..."
            style={{
              width: 220,
              padding: '9px 10px',
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,0.55)',
              background: '#ffffff',
              color: '#0f172a',
              fontSize: 12,
              outline: 'none',
            }}
          />
          <button
            onClick={() => void sendText()}
            style={{
              padding: '9px 12px',
              borderRadius: 12,
              border: '1px solid rgba(11, 17, 54, 0.25)',
              background: '#0b1136',
              color: '#fff',
              fontSize: 12,
              fontWeight: 900,
              cursor: 'pointer',
              minWidth: 70,
            }}
          >
            Invia
          </button>
        </footer>
      </div>
    </main>
  );
}
