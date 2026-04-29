'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Loader2, OctagonX, RefreshCcw, Send } from 'lucide-react';
import type { FlowExecutionResult } from '@/lib/compila-bando/types';
import type { ExtractedData } from '../lib/types';
import { FORM_FIELDS } from '../lib/demoData';
import s from '../styles/compila-bando.module.css';

type Props = {
  extracted: ExtractedData;
  spidAuthenticated: boolean;
  onSpidLogin: () => void;
  onComplete: () => void;
};

type Phase =
  | 'loading'
  | 'spid-login'
  | 'spid-auth-wait'
  | 'auto-filling'
  | 'uploading-docs'
  | 'ready-to-submit'
  | 'submitted';

type SessionData = {
  liveViewUrl: string;
  connectUrl: string;
  sessionId: string;
  provider: string;
  sessionExpiresAt: string | null;
};

type AutoFillResponse = {
  status?: 'live' | 'demo';
  provider?: string;
  liveViewUrl?: string | null;
  connectUrl?: string | null;
  browserbaseSessionId?: string | null;
  sessionExpiresAt?: string | null;
  providerError?: string | null;
};

type MirrorFrame = {
  mimeType: string;
  data: string;
  meta: { url: string; width: number; height: number; dpr: number };
  ts: number;
};

type SessionStatusResponse =
  | { ok: true; url: string; loggedIn: boolean; hint: string }
  | { ok?: false; error?: string };

function buildClientPayload(extracted: ExtractedData) {
  return {
    firstName: extracted.nome_legale_rappresentante?.split(' ')[0] || '',
    lastName: extracted.nome_legale_rappresentante?.split(' ').slice(1).join(' ') || '',
    fullName: extracted.nome_legale_rappresentante || '',
    zip: (extracted.sede_legale?.match(/\b(\d{5})\b/) || [])[1] || '',
    province: (extracted.sede_legale?.match(/\(([A-Z]{2})\)/) || [])[1] || '',
    city: (extracted.sede_legale?.match(/^([^,(]+)/) || [])[1]?.trim() || '',
    pec: extracted.email_pec || '',
    phone: extracted.telefono || '',
    ragioneSociale: extracted.ragione_sociale || '',
    codiceFiscale: extracted.codice_fiscale || '',
    partitaIva: extracted.partita_iva || '',
    rea: extracted.rea || '',
    sedeLegale: extracted.sede_legale || '',
    formaGiuridica: extracted.forma_giuridica || '',
  };
}

export function Step9BrowserBando({ extracted, spidAuthenticated: _spidAuthenticated, onSpidLogin, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [session, setSession] = useState<SessionData | null>(null);
  const [flowResult, setFlowResult] = useState<string | null>(null);
  const [disconnectNotice, setDisconnectNotice] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [spidTabOpened, setSpidTabOpened] = useState(false);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [mirrorFrame, setMirrorFrame] = useState<MirrorFrame | null>(null);
  const [mirrorError, setMirrorError] = useState<string | null>(null);
  const [typeBuffer, setTypeBuffer] = useState('');
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const initRef = useRef(false);
  const mirrorImgRef = useRef<HTMLImageElement>(null);
  const hasStartedRef = useRef(false);
  const executeAbortRef = useRef<AbortController | null>(null);

  const initializeSession = useCallback(async () => {
    setIsInitializing(true);
    setPhase('loading');
    setSession(null);
    setDisconnectNotice(null);
    setFlowResult(null);
    setMirrorFrame(null);
    setMirrorError(null);
    setSpidTabOpened(false);
    setStatusHint(null);
    hasStartedRef.current = false;
    executeAbortRef.current?.abort();
    executeAbortRef.current = null;

    const fieldValues: Record<string, string> = {};
    FORM_FIELDS.forEach((field) => {
      const value = (extracted as Record<string, string | undefined>)[field.key];
      if (value) fieldValues[field.key] = value;
    });

    try {
      const response = await fetch('/api/compila-bando/auto-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: fieldValues }),
      });
      const data = (await response.json()) as AutoFillResponse;

      if (
        data.status === 'live' &&
        data.liveViewUrl &&
        data.connectUrl &&
        data.browserbaseSessionId
      ) {
        setSession({
          liveViewUrl: data.liveViewUrl,
          connectUrl: data.connectUrl,
          sessionId: data.browserbaseSessionId,
          provider: data.provider || 'browserbase',
          sessionExpiresAt: data.sessionExpiresAt || null,
        });
        setPhase('spid-login');
        return;
      }

      setPhase('spid-login');
      setFlowResult(
        data.providerError
          ? `Errore provider Browserbase: ${data.providerError}`
          : 'Browserbase non disponibile. Verifica le variabili env.'
      );
    } catch (error) {
      setPhase('spid-login');
      setFlowResult(
        `Errore inizializzazione sessione: ${
          error instanceof Error ? error.message : 'errore non gestito'
        }`
      );
    } finally {
      setIsInitializing(false);
    }
  }, [extracted]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    void initializeSession();
  }, [initializeSession]);

  const fetchMirrorFrame = useCallback(async () => {
    if (!session) return;

    try {
      const response = await fetch('/api/compila-bando/remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'screenshot', sessionId: session.sessionId }),
      });
      const data = (await response.json()) as
        | { ok: true; mimeType: string; data: string; meta: MirrorFrame['meta'] }
        | { ok?: false; error?: string };

      if ('ok' in data && data.ok) {
        setMirrorFrame({
          mimeType: data.mimeType,
          data: data.data,
          meta: data.meta,
          ts: Date.now(),
        });
        setMirrorError(null);
        return;
      }

      setMirrorError('error' in data && data.error ? data.error : 'Screenshot non disponibile');
    } catch (e) {
      setMirrorError(e instanceof Error ? e.message : 'Errore screenshot');
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    if (!(phase === 'spid-login' || phase === 'spid-auth-wait' || phase === 'auto-filling')) return;

    let alive = true;
    let timer: number | null = null;

    const tick = async () => {
      if (!alive) return;
      await fetchMirrorFrame();
      if (!alive) return;
      timer = window.setTimeout(tick, 1500);
    };

    void tick();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [session, phase, fetchMirrorFrame]);

  const handleRetrySession = useCallback(() => {
    void initializeSession();
  }, [initializeSession]);

  const handleOpenSpidTab = useCallback(() => {
    if (!session?.liveViewUrl) return;
    const w = window.open(session.liveViewUrl, '_blank', 'noopener,noreferrer');
    setSpidTabOpened(Boolean(w));
    setPhase('spid-auth-wait');
  }, [session]);

  const handleStop = useCallback(async () => {
    executeAbortRef.current?.abort();
    executeAbortRef.current = null;
    setIsExecuting(false);
    hasStartedRef.current = false;
    setFlowResult('Operazione interrotta.');

    if (session?.sessionId) {
      try {
        await fetch('/api/compila-bando/close-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.sessionId }),
        });
      } catch {
        // Best effort
      }
    }

    void initializeSession();
  }, [session, initializeSession]);

  const remoteAction = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!session) return false;
      try {
        const response = await fetch('/api/compila-bando/remote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.sessionId, ...payload }),
        });
        const data = (await response.json()) as { ok?: boolean; error?: string };
        if (data.ok) return true;
        setMirrorError(data.error || 'Errore controllo remoto');
        return false;
      } catch (e) {
        setMirrorError(e instanceof Error ? e.message : 'Errore controllo remoto');
        return false;
      }
    },
    [session]
  );

  const handleMirrorClick = useCallback(
    async (event: MouseEvent<HTMLImageElement>) => {
      if (!mirrorFrame) return;
      // Mirror is only interactive as fallback when the new tab could not be opened.
      if (spidTabOpened) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      // Letterbox-aware mapping for objectFit: 'contain'
      const imgW = rect.width;
      const imgH = rect.height;
      const srcW = mirrorFrame.meta.width;
      const srcH = mirrorFrame.meta.height;
      const scale = Math.min(imgW / srcW, imgH / srcH);
      const drawnW = srcW * scale;
      const drawnH = srcH * scale;
      const offsetX = (imgW - drawnW) / 2;
      const offsetY = (imgH - drawnH) / 2;

      const localX = event.clientX - rect.left - offsetX;
      const localY = event.clientY - rect.top - offsetY;
      if (localX < 0 || localY < 0 || localX > drawnW || localY > drawnH) return;

      const x = Math.max(0, Math.round((localX / drawnW) * srcW));
      const y = Math.max(0, Math.round((localY / drawnH) * srcH));

      const ok = await remoteAction({ action: 'click', x, y });
      if (ok) void fetchMirrorFrame();
    },
    [mirrorFrame, remoteAction, fetchMirrorFrame, spidTabOpened]
  );

  const handleSendType = useCallback(async () => {
    const text = typeBuffer;
    if (!text.trim()) return;
    const ok = await remoteAction({ action: 'type', text });
    if (ok) {
      setTypeBuffer('');
      void fetchMirrorFrame();
    }
  }, [typeBuffer, remoteAction, fetchMirrorFrame]);

  const handlePressKey = useCallback(
    async (key: string) => {
      const ok = await remoteAction({ action: 'press', key });
      if (ok) void fetchMirrorFrame();
    },
    [remoteAction, fetchMirrorFrame]
  );

  const handleScroll = useCallback(
    async (deltaY: number) => {
      const ok = await remoteAction({ action: 'scroll', deltaY });
      if (ok) void fetchMirrorFrame();
    },
    [remoteAction, fetchMirrorFrame]
  );

  const startExecuteFlow = useCallback(async () => {
    if (!session) return;
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    setDisconnectNotice(null);
    setPhase('auto-filling');
    setFlowResult(null);
    setIsExecuting(true);

    try {
      const controller = new AbortController();
      executeAbortRef.current = controller;
      const response = await fetch('/api/compila-bando/execute-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectUrl: session.connectUrl,
          client: buildClientPayload(extracted),
        }),
        signal: controller.signal,
      });

      const data = (await response.json()) as
        | FlowExecutionResult
        | { error?: string; ok?: false; failedSteps?: Array<{ error?: string }> };

      if ('ok' in data && data.ok) {
        onSpidLogin();
        const failedCount = data.failedSteps.length;
        setFlowResult(
          failedCount > 0
            ? `Compilazione quasi completata: ${data.stepsExecuted} step ok, ${failedCount} da rifinire.`
            : `Compilazione completata: ${data.stepsExecuted} step eseguiti in ${data.elapsedMs}ms.`
        );
        setPhase('uploading-docs');
        return;
      }

      const failMsg =
        'error' in data && data.error
          ? data.error
          : Array.isArray((data as { failedSteps?: Array<{ error?: string }> }).failedSteps) &&
            (data as { failedSteps?: Array<{ error?: string }> }).failedSteps![0]?.error
          ? (data as { failedSteps?: Array<{ error?: string }> }).failedSteps![0].error
          : 'Errore sconosciuto in execute-flow';

      setFlowResult(`Errore compilazione: ${failMsg}`);
      setPhase('spid-auth-wait');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'errore non gestito';
      if (msg.toLowerCase().includes('aborted')) {
        setFlowResult('Operazione interrotta.');
      } else {
        setFlowResult(`Errore compilazione: ${msg}`);
      }
      setPhase('spid-auth-wait');
    } finally {
      setIsExecuting(false);
      executeAbortRef.current = null;
    }
  }, [session, extracted, onSpidLogin]);

  useEffect(() => {
    if (!session) return;
    if (!(phase === 'spid-auth-wait' || phase === 'spid-login')) return;
    if (isExecuting) return;

    let alive = true;
    let timer: number | null = null;

    const tick = async () => {
      if (!alive) return;
      try {
        const res = await fetch('/api/compila-bando/session-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.sessionId }),
        });
        const json = (await res.json()) as SessionStatusResponse;
        if (!alive) return;
        if ('ok' in json && json.ok) {
          setStatusHint(json.hint || null);
          if (json.loggedIn) {
            onSpidLogin();
            void startExecuteFlow();
            return;
          }
        }
      } catch {
        // ignore transient polling failures
      }
      timer = window.setTimeout(tick, 2000);
    };

    void tick();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [session, phase, isExecuting, onSpidLogin, startExecuteFlow]);

  useEffect(() => {
    if (phase !== 'uploading-docs') return;
    const timer = setTimeout(() => setPhase('ready-to-submit'), 2_000);
    return () => clearTimeout(timer);
  }, [phase]);

  const handleSubmit = useCallback(() => {
    setPhase('submitted');
    setTimeout(onComplete, 800);
  }, [onComplete]);

  return (
    <div>
      <h2 className={s.cbCardTitle} style={{ marginBottom: 4 }}>
        Compilazione Bando su Invitalia
      </h2>
      <p className={s.cbCardSubtitle} style={{ marginBottom: 20 }}>
        {phase === 'loading'
          ? 'Avvio sessione browser cloud...'
          : phase === 'submitted'
          ? 'Domanda inviata con successo!'
          : phase === 'spid-auth-wait'
          ? 'Completa l\'autenticazione SPID nella scheda aperta. Appena hai finito, la compilazione parte da sola.'
          : phase === 'auto-filling'
          ? 'L\'Agente AI sta compilando la domanda sul sito reale di Invitalia...'
          : 'Browser cloud connesso — autenticati con SPID per proseguire'}
      </p>

      {(phase === 'auto-filling' || phase === 'uploading-docs' || phase === 'ready-to-submit') && (
        <div
          style={{
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: 12,
            padding: '8px 14px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: '#065f46',
          }}
        >
          <Check size={14} />
          Autenticato come: {extracted.nome_legale_rappresentante || 'MARIO ROSSI'} — Invitalia Area
          Riservata
        </div>
      )}

      {disconnectNotice && (
        <div
          style={{
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 12,
            fontSize: 12,
            color: '#9a3412',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={14} />
            {disconnectNotice}
          </span>
          <button className={s.cbBtnMuted} onClick={handleRetrySession} type="button" disabled={isInitializing}>
            <RefreshCcw size={14} />
            Riconnetti sessione
          </button>
        </div>
      )}

      {flowResult && (
        <div
          style={{
            background: flowResult.includes('Errore') ? '#fef2f2' : '#ecfdf5',
            border: `1px solid ${flowResult.includes('Errore') ? '#fecaca' : '#a7f3d0'}`,
            borderRadius: 10,
            padding: '8px 14px',
            marginBottom: 12,
            fontSize: 12,
            color: flowResult.includes('Errore') ? '#991b1b' : '#065f46',
          }}
        >
          {flowResult}
        </div>
      )}

      <div className={s.cbBrowserFrame}>
        <div className={s.cbBrowserTopbar}>
          <div className={s.cbBrowserDots}>
            <div className={`${s.cbBrowserDot} ${s.cbBrowserDotRed}`} />
            <div className={`${s.cbBrowserDot} ${s.cbBrowserDotYellow}`} />
            <div className={`${s.cbBrowserDot} ${s.cbBrowserDotGreen}`} />
          </div>
          <div className={s.cbBrowserAddress}>
            {phase === 'loading'
              ? 'Caricamento...'
              : phase === 'spid-login' || phase === 'spid-auth-wait'
              ? 'minervaorgb2c.b2clogin.com — Accesso SPID Invitalia'
              : phase === 'submitted'
              ? 'invitalia-areariservata-fe.npi.invitalia.it — Domanda Inviata'
              : 'invitalia-areariservata-fe.npi.invitalia.it — Domanda di Candidatura'}
          </div>
        </div>

        <div className={s.cbBrowserContent}>
          {phase === 'loading' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <Loader2 size={24} className={s.cbSpinner} />
              <span style={{ fontSize: 13, color: '#94a3b8' }}>
                Connessione al browser cloud Browserbase...
              </span>
            </div>
          )}

          {!session && phase !== 'loading' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <p style={{ fontSize: 14, color: '#ef4444' }}>Browserbase non disponibile</p>
              <button className={s.cbBtnMuted} onClick={handleRetrySession} type="button" disabled={isInitializing}>
                {isInitializing ? <Loader2 size={14} className={s.cbSpinner} /> : <RefreshCcw size={14} />}
                Riprova connessione
              </button>
            </div>
          )}

          {session && phase !== 'submitted' && (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              {(phase === 'spid-login' || phase === 'spid-auth-wait') && (
                <div style={{ width: '100%', height: '100%', background: '#0b1136' }}>
                  {mirrorFrame ? (
                    <img
                      ref={mirrorImgRef}
                      src={`data:${mirrorFrame.mimeType};base64,${mirrorFrame.data}`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        cursor: spidTabOpened ? 'default' : 'crosshair',
                        background: '#0b1136',
                        display: 'block',
                      }}
                      onClick={handleMirrorClick}
                      alt="Invitalia Mirror"
                    />
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        flexDirection: 'column',
                        gap: 10,
                        color: '#e2e8f0',
                        fontSize: 13,
                      }}
                    >
                      <Loader2 size={18} className={s.cbSpinner} />
                      Carico schermata...
                    </div>
                  )}

                  {mirrorError && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 12,
                        left: 12,
                        right: 12,
                        background: 'rgba(254, 242, 242, 0.95)',
                        border: '1px solid #fecaca',
                        borderRadius: 10,
                        padding: '8px 12px',
                        color: '#991b1b',
                        fontSize: 12,
                        zIndex: 3,
                      }}
                    >
                      {mirrorError}
                    </div>
                  )}
                </div>
              )}

              {phase === 'spid-login' && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: controlsCollapsed ? '10px 14px' : '12px 16px',
                    background: 'rgba(255,255,255,0.96)',
                    borderTop: '1px solid #e8ecf4',
                    zIndex: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    flexDirection: 'column',
                  }}
                >
	                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', justifyContent: 'space-between' }}>
	                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
	                      <span style={{ fontSize: 12, color: '#64748b' }}>
	                        Apri SPID in nuova scheda. Quando finisci, la compilazione parte automaticamente.
	                      </span>
	                      {session.sessionExpiresAt && (
	                        <span style={{ fontSize: 11, color: '#94a3b8' }}>
	                          Scade: {session.sessionExpiresAt}
	                        </span>
	                      )}
	                      {statusHint && (
	                        <span style={{ fontSize: 11, color: '#94a3b8' }}>
	                          Stato: {statusHint}
	                        </span>
	                      )}
	                    </div>
                    <button
                      className={s.cbBtnMuted}
                      type="button"
                      onClick={() => setControlsCollapsed((v) => !v)}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {controlsCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      {controlsCollapsed ? 'Mostra' : 'Nascondi'} controlli
                    </button>
                  </div>

	                  {!controlsCollapsed && (
	                    <>
	                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
	                        <button className={s.cbBtnGreen} type="button" onClick={handleOpenSpidTab} disabled={isExecuting}>
	                          {isExecuting ? <Loader2 size={14} className={s.cbSpinner} /> : <Check size={14} />}
	                          Accedi con SPID (nuova scheda)
	                        </button>
	                        <button className={s.cbBtnMuted} type="button" onClick={handleStop}>
	                          <OctagonX size={14} />
	                          Stop
	                        </button>
	                        {!spidTabOpened && (
	                          <span style={{ fontSize: 11, color: '#991b1b', alignSelf: 'center' }}>
	                            Se la scheda non si apre, puoi usare il mirror cliccando sulla schermata sopra.
	                          </span>
	                        )}
	                      </div>
	                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
	                        <button className={s.cbBtnMuted} type="button" onClick={() => void handlePressKey('Tab')} disabled={spidTabOpened}>
	                          TAB
	                        </button>
	                        <button className={s.cbBtnMuted} type="button" onClick={() => void handlePressKey('Enter')} disabled={spidTabOpened}>
	                          INVIO
	                        </button>
	                        <button className={s.cbBtnMuted} type="button" onClick={() => void handlePressKey('Backspace')} disabled={spidTabOpened}>
	                          BACK
	                        </button>
	                        <button className={s.cbBtnMuted} type="button" onClick={() => void handleScroll(-520)} disabled={spidTabOpened}>
	                          Su
	                        </button>
	                        <button className={s.cbBtnMuted} type="button" onClick={() => void handleScroll(520)} disabled={spidTabOpened}>
	                          Giu
	                        </button>
	                      </div>
	                      <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 520 }}>
	                        <input
	                          value={typeBuffer}
	                          onChange={(e) => setTypeBuffer(e.target.value)}
	                          placeholder="Scrivi qui e invia alla sessione..."
	                          disabled={spidTabOpened}
	                          style={{
	                            flex: 1,
	                            border: '1px solid #e2e8f0',
	                            borderRadius: 10,
                            padding: '10px 12px',
                            fontSize: 13,
	                            outline: 'none',
	                          }}
	                        />
	                        <button className={s.cbBtnGreen} type="button" onClick={handleSendType} disabled={spidTabOpened}>
	                          <Send size={14} />
	                          Invia
	                        </button>
	                      </div>
	                    </>
	                  )}
	                </div>
	              )}

	              {phase === 'spid-auth-wait' && (
	                <div
	                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '16px 24px',
                    background: 'rgba(255,255,255,0.98)',
                    borderTop: '1px solid #e8ecf4',
                    zIndex: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
	                  <div>
	                    <p style={{ fontSize: 13, fontWeight: 600, color: '#0b1136', margin: 0 }}>
	                      Completa SPID nella scheda aperta. La compilazione parte automaticamente.
	                    </p>
	                    <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>
	                      {statusHint ? `Stato: ${statusHint}` : 'In attesa di login completato...'}
	                    </p>
	                  </div>
	                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
	                    <button className={s.cbBtnGreen} type="button" onClick={handleOpenSpidTab} disabled={isExecuting}>
	                      {isExecuting ? <Loader2 size={14} className={s.cbSpinner} /> : <Check size={14} />}
	                      Riapri SPID
	                    </button>
	                    <button className={s.cbBtnMuted} type="button" onClick={handleStop}>
	                      <OctagonX size={14} />
	                      Stop
	                    </button>
	                  </div>
	                </div>
	              )}

              {phase === 'auto-filling' && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    flexDirection: 'column',
                    gap: 16,
                    padding: 20,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '12px 20px',
                      background: '#f0fdf4',
                      borderRadius: 10,
                      border: '1px solid #bbf7d0',
                    }}
                  >
                    <Loader2 size={14} className={s.cbSpinner} style={{ color: '#22c55f' }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#166534' }}>
                      Agente AI al lavoro sul sito reale di Invitalia...
                    </span>
                  </div>

                  {FORM_FIELDS.map((field) => {
                    const value = (extracted as Record<string, string | undefined>)[field.key] || '';
                    return (
                      <div
                        key={field.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 14px',
                          width: '100%',
                          maxWidth: 400,
                          background: value ? '#f8fafc' : '#fef2f2',
                          borderRadius: 8,
                          border: value ? '1px solid #e2e8f0' : '1px solid #fecaca',
                          fontSize: 13,
                        }}
                      >
                        <span style={{ color: '#64748b', minWidth: 160 }}>{field.label}</span>
                        <span
                          style={{
                            fontWeight: 600,
                            color: value ? '#0b1136' : '#991b1b',
                            flex: 1,
                          }}
                        >
                          {value || 'Dato mancante'}
                        </span>
                        {value ? (
                          <Check size={12} style={{ color: '#22c55e' }} />
                        ) : (
                          <span style={{ fontSize: 10, color: '#991b1b' }}>!</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {phase === 'uploading-docs' && (
                <div style={{ padding: 20, overflow: 'auto', height: '100%' }}>
                  {FORM_FIELDS.map((field) => (
                    <div
                      key={field.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        marginBottom: 6,
                        background: '#f0fdf4',
                        borderRadius: 8,
                        border: '1px solid #bbf7d0',
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: '#64748b', minWidth: 160 }}>{field.label}</span>
                      <span style={{ fontWeight: 600, color: '#166534' }}>
                        {(extracted as Record<string, string | undefined>)[field.key] || ''}
                      </span>
                      <Check size={12} style={{ color: '#22c55e', marginLeft: 'auto' }} />
                    </div>
                  ))}
                  <div style={{ marginTop: 16 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#0b1136', margin: '0 0 12px' }}>
                      Caricamento Documenti
                    </p>
                    {['Scheda-Aziendale-BNDO.pdf', 'Documento-Anagrafico-BNDO.docx'].map((name, index) => (
                      <div
                        key={name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 0',
                          borderBottom: index === 0 ? '1px solid #f1f5f9' : 'none',
                          fontSize: 12,
                          color: '#0b1136',
                        }}
                      >
                        <span style={{ flex: 1 }}>{name}</span>
                        <Loader2 size={14} className={s.cbSpinner} style={{ color: '#22c55f' }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {phase === 'ready-to-submit' && (
                <div style={{ padding: 20, overflow: 'auto', height: '100%' }}>
                  {FORM_FIELDS.map((field) => (
                    <div
                      key={field.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        marginBottom: 6,
                        background: '#f0fdf4',
                        borderRadius: 8,
                        border: '1px solid #bbf7d0',
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: '#64748b', minWidth: 160 }}>{field.label}</span>
                      <span style={{ fontWeight: 600, color: '#166534' }}>
                        {(extracted as Record<string, string | undefined>)[field.key] || ''}
                      </span>
                      <Check size={12} style={{ color: '#22c55e', marginLeft: 'auto' }} />
                    </div>
                  ))}
                  <div style={{ marginTop: 16 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#0b1136', margin: '0 0 8px' }}>
                      Documenti caricati
                    </p>
                    {['Scheda-Aziendale-BNDO.pdf', 'Documento-Anagrafico-BNDO.docx'].map((name) => (
                      <div
                        key={name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 0',
                          fontSize: 12,
                          color: '#166534',
                        }}
                      >
                        <Check size={12} />
                        {name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {phase === 'submitted' && (
            <div
              style={{
                padding: 40,
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
              }}
            >
              <div className={s.cbSuccessCheck} style={{ width: 56, height: 56 }}>
                <Check size={28} strokeWidth={3} />
              </div>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#0b1136', margin: '12px 0 4px' }}>
                Domanda Inviata!
              </p>
              <p style={{ fontSize: 12, color: '#64748b' }}>Reindirizzamento in corso...</p>
            </div>
          )}
        </div>

        {phase === 'ready-to-submit' && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              padding: '16px 24px',
              background: '#ffffff',
              borderTop: '1px solid #e8ecf4',
              zIndex: 3,
              textAlign: 'center',
            }}
          >
            <button className={s.cbInviaBtn} onClick={handleSubmit} type="button">
              <Send size={16} />
              Invia Domanda
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
