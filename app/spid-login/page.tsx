'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SessionStatusPayload =
  | { ok: true; url: string; loggedIn: boolean; hint: string; lastSeenAt?: string | null }
  | { ok: false; error: string };

type SessionInfoPayload =
  | { ok: true; liveViewUrl: string; expiresAt?: string | null }
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
  const [liveViewUrl, setLiveViewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Caricamento...');
  const [lastUrl, setLastUrl] = useState<string>('');
  const timerRef = useRef<number | null>(null);

  const title = useMemo(() => 'browser.bndo.it', []);

  const stop = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const fetchSessionInfo = useCallback(async () => {
    if (!sessionId) return;
    setStatus('Connessione in corso...');
    const res = await fetch('/api/compila-bando/session-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    const json = (await res.json().catch(() => ({}))) as SessionInfoPayload;
    if (!res.ok || !json.ok) {
      setStatus(`Errore sessione: ${'error' in json && json.error ? json.error : 'non disponibile'}`);
      return;
    }
    setLiveViewUrl(json.liveViewUrl);
    setStatus('Connesso');
  }, [sessionId]);

  const tickStatus = useCallback(async () => {
    if (!sessionId) return;
    const res = await fetch('/api/compila-bando/session-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    const json = (await res.json().catch(() => ({}))) as SessionStatusPayload;
    if (json && 'ok' in json && json.ok) {
      setLastUrl(json.url || '');
      if (json.loggedIn) {
        window.location.replace('/spid-done');
      }
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setStatus('sessionId mancante');
      return;
    }
    void fetchSessionInfo();
    void tickStatus();
    stop();
    timerRef.current = window.setInterval(() => void tickStatus(), 2000);
    return () => stop();
  }, [fetchSessionInfo, sessionId, stop, tickStatus]);

  const showHostname = useMemo(() => {
    try {
      if (!lastUrl) return '';
      return new URL(lastUrl).hostname;
    } catch {
      return '';
    }
  }, [lastUrl]);

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
              title={lastUrl || ''}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  background: '#0b1136',
                  color: '#fff',
                  fontSize: 10,
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 900,
                }}
              >
                B
              </div>
              <div style={{ fontSize: 12, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {lastUrl || '—'}
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: 11 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: liveViewUrl ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
                {title}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: '#64748b', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {showHostname}
          </div>
        </header>

        <div style={{ background: '#111827' }}>
          {liveViewUrl ? (
            <iframe
              src={liveViewUrl}
              title="SPID Live View"
              style={{ width: '100%', height: '100%', border: 0, background: '#111827' }}
              allow="clipboard-read; clipboard-write"
            />
          ) : (
            <div style={{ color: '#cbd5e1', fontSize: 12, padding: 12 }}>Caricamento...</div>
          )}
        </div>

        <footer
          style={{
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderTop: '1px solid rgba(148, 163, 184, 0.35)',
            background: '#f8fafc',
          }}
        >
          <div style={{ fontSize: 12, color: '#475569' }}>
            Completa SPID qui. Appena finito, questa finestra si chiude da sola.
          </div>
          <div style={{ flex: 1 }} />
          {liveViewUrl && (
            <a
              href={liveViewUrl}
              target="_self"
              rel="noreferrer"
              style={{
                padding: '9px 12px',
                borderRadius: 12,
                border: '1px solid rgba(148,163,184,0.55)',
                background: '#fff',
                color: '#0f172a',
                fontSize: 12,
                fontWeight: 800,
                textDecoration: 'none',
              }}
              title="Se non vedi bene il contenuto, apri la live view diretta."
            >
              Apri Live View
            </a>
          )}
        </footer>
      </div>
    </main>
  );
}

