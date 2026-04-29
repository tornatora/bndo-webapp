'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2, OctagonX, RefreshCcw, Send } from 'lucide-react';
import type { FlowExecutionResult } from '@/lib/compila-bando/types';
import type { CustomField, ExtractedData } from '../lib/types';
import { FORM_FIELDS } from '../lib/demoData';
import s from '../styles/compila-bando.module.css';

type Props = {
  extracted: ExtractedData;
  customFields?: CustomField[];
  applicationId?: string | null;
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

type SessionStatusResponse =
  | { ok: true; url: string; loggedIn: boolean; hint: string; lastSeenAt?: string | null }
  | { ok?: false; error?: string };

type ReadinessResponse =
  | {
      ok: true;
      ready: boolean;
      applicationId: string | null;
      missingFields: Array<{ key: string; label: string }>;
      missingDocuments: Array<{ key: string; label: string }>;
    }
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

export function Step9BrowserBando({
  extracted,
  customFields = [],
  applicationId,
  spidAuthenticated: _spidAuthenticated,
  onSpidLogin,
  onComplete,
}: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [session, setSession] = useState<SessionData | null>(null);
  const [flowResult, setFlowResult] = useState<string | null>(null);
  const [disconnectNotice, setDisconnectNotice] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [spidTabOpened, setSpidTabOpened] = useState(false);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [statusLastSeenAt, setStatusLastSeenAt] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<Array<{ key: string; label: string }>>([]);
  const [missingDocuments, setMissingDocuments] = useState<Array<{ key: string; label: string }>>([]);
  const [resolvedApplicationId, setResolvedApplicationId] = useState<string | null>(applicationId || null);
  const [typingFieldIndex, setTypingFieldIndex] = useState(0);
  const [typedCharsByKey, setTypedCharsByKey] = useState<Record<string, number>>({});
  const [fakeCursor, setFakeCursor] = useState<{ x: number; y: number; clicking: boolean }>({
    x: 52,
    y: 90,
    clicking: false,
  });
  const initRef = useRef(false);
  const hasStartedRef = useRef(false);
  const authRedirectSeenRef = useRef(false);
  const executeAbortRef = useRef<AbortController | null>(null);

  const initializeSession = useCallback(async () => {
    setIsInitializing(true);
    setPhase('loading');
    setSession(null);
    setDisconnectNotice(null);
    setFlowResult(null);
    setSpidTabOpened(false);
    setStatusHint(null);
    setStatusLastSeenAt(null);
    setMissingFields([]);
    setMissingDocuments([]);
    setResolvedApplicationId(applicationId || null);
    hasStartedRef.current = false;
    authRedirectSeenRef.current = false;
    executeAbortRef.current?.abort();
    executeAbortRef.current = null;

    const fieldValues: Record<string, string> = {};
    FORM_FIELDS.forEach((field) => {
      const value = (extracted as Record<string, string | undefined>)[field.key];
      if (value) fieldValues[field.key] = value;
    });

    try {
      const readinessRes = await fetch('/api/compila-bando/readiness-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: applicationId || undefined,
          extracted,
          customFields,
        }),
      });
      const readiness = (await readinessRes.json()) as ReadinessResponse;
      if (!readinessRes.ok || !('ok' in readiness) || !readiness.ok) {
        throw new Error('Controllo completezza non disponibile');
      }
      setResolvedApplicationId(readiness.applicationId || applicationId || null);
      if (!readiness.ready) {
        setMissingFields(readiness.missingFields || []);
        setMissingDocuments(readiness.missingDocuments || []);
        setPhase('spid-login');
        setFlowResult('Completa i dati/documenti mancanti prima di avviare SPID.');
        return;
      }

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
  }, [applicationId, customFields, extracted]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    void initializeSession();
  }, [initializeSession]);

  const handleRetrySession = useCallback(() => {
    void initializeSession();
  }, [initializeSession]);

  const handleOpenSpidTab = useCallback(() => {
    if (!session?.liveViewUrl) return;
    const spidWindow = window.open(session.liveViewUrl, 'bndo_spid_live_view');
    const opened = Boolean(spidWindow);
    setSpidTabOpened(opened);
    setPhase('spid-auth-wait');
    setDisconnectNotice(opened ? null : 'Popup bloccato: abilita i popup per BNDO e riapri la scheda SPID.');
    setFlowResult(
      opened
        ? 'Scheda SPID aperta: torna qui, la dashboard avvia la compilazione appena rileva il login.'
        : null
    );

    // Best effort: browser vendors may still keep the new tab focused, but when allowed
    // we bring BNDO back in front so the user sees the control center again.
    window.setTimeout(() => {
      try {
        spidWindow?.blur();
        window.focus();
      } catch {
        // Best effort only.
      }
    }, 350);
    window.setTimeout(() => {
      try {
        window.focus();
      } catch {
        // Best effort only.
      }
    }, 1200);
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

  const startExecuteFlow = useCallback(async () => {
    if (!session) return;
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    setDisconnectNotice(null);
    setPhase('auto-filling');
    setFlowResult('Accesso SPID rilevato: avvio compilazione automatica dal JSON...');
    setIsExecuting(true);

    try {
      const controller = new AbortController();
      executeAbortRef.current = controller;
      const response = await fetch('/api/compila-bando/execute-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connectUrl: session.connectUrl,
            sessionId: session.sessionId,
            applicationId: resolvedApplicationId || undefined,
            phase: 'form_fill',
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
  }, [session, extracted, onSpidLogin, resolvedApplicationId]);

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
          setStatusLastSeenAt(json.lastSeenAt || null);
          const lowerUrl = (json.url || '').toLowerCase();
          if (
            json.hint === 'b2c_login' ||
            json.hint === 'spid_provider' ||
            (!!lowerUrl &&
              lowerUrl !== 'about:blank' &&
              !lowerUrl.includes('invitalia-areariservata-fe.npi.invitalia.it'))
          ) {
            authRedirectSeenRef.current = true;
          }

          if (json.loggedIn && (phase === 'spid-auth-wait' || authRedirectSeenRef.current)) {
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

  useEffect(() => {
    if (phase !== 'auto-filling') return;
    let cancelled = false;
    setTypingFieldIndex(0);
    setTypedCharsByKey({});

    const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    const runTyping = async () => {
      for (let i = 0; i < FORM_FIELDS.length; i += 1) {
        if (cancelled) return;
        const field = FORM_FIELDS[i];
        const value = ((extracted as Record<string, string | undefined>)[field.key] || '').trim();
        setTypingFieldIndex(i);
        setFakeCursor({ x: 66, y: 146 + i * 48, clicking: true });
        await wait(70);
        setFakeCursor({ x: 66, y: 146 + i * 48, clicking: false });
        if (!value) {
          setTypedCharsByKey((prev) => ({ ...prev, [field.key]: 0 }));
          await wait(140);
          continue;
        }
        for (let len = 1; len <= value.length; len += 1) {
          if (cancelled) return;
          setTypedCharsByKey((prev) => ({ ...prev, [field.key]: len }));
          const jitter = 13 + Math.floor(Math.random() * 26);
          await wait(jitter);
        }
        await wait(80);
      }
      setTypingFieldIndex(FORM_FIELDS.length);
      setFakeCursor({ x: 350, y: 420, clicking: true });
      await wait(70);
      setFakeCursor({ x: 350, y: 420, clicking: false });
    };

    void runTyping();
    return () => {
      cancelled = true;
    };
  }, [phase, extracted]);

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

      {(missingFields.length > 0 || missingDocuments.length > 0) && (
        <div
          style={{
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 12,
            fontSize: 12,
            color: '#9a3412',
          }}
        >
          <strong style={{ display: 'block', marginBottom: 6 }}>Blocco pre-Step9: completa prima questi elementi</strong>
          {missingFields.length > 0 && (
            <div style={{ marginBottom: 4 }}>
              Campi: {missingFields.map((item) => item.label).join(', ')}
            </div>
          )}
          {missingDocuments.length > 0 && (
            <div>Documenti: {missingDocuments.map((item) => item.label).join(', ')}</div>
          )}
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
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    padding: 24,
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 640,
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 14,
                      padding: 18,
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0b1136' }}>
                      SPID solo in nuova scheda (niente fake browser in dashboard)
                    </p>
                    <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b' }}>
                      Apri la scheda SPID, completa login, poi torna qui: la compilazione parte automaticamente.
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                      <button className={s.cbBtnGreen} type="button" onClick={handleOpenSpidTab} disabled={isExecuting}>
                        {isExecuting ? <Loader2 size={14} className={s.cbSpinner} /> : <Check size={14} />}
                        {phase === 'spid-auth-wait' ? 'Riapri SPID' : 'Accedi con SPID (nuova scheda)'}
                      </button>
                      <button className={s.cbBtnMuted} type="button" onClick={handleStop}>
                        <OctagonX size={14} />
                        Stop
                      </button>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 11, color: '#94a3b8' }}>
                      {statusHint ? `Stato: ${statusHint}` : 'Stato: in attesa login SPID'}
                      {statusLastSeenAt ? ` · Check ${new Date(statusLastSeenAt).toLocaleTimeString('it-IT')}` : ''}
                      {session.sessionExpiresAt ? ` · Scade: ${session.sessionExpiresAt}` : ''}
                    </div>
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
                    position: 'relative',
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
                    const typedLen = typedCharsByKey[field.key] ?? (typingFieldIndex > FORM_FIELDS.indexOf(field) ? value.length : 0);
                    const shownValue = value.slice(0, typedLen);
                    const isTyping = typingFieldIndex === FORM_FIELDS.indexOf(field) && typedLen < value.length;
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
                            minHeight: 18,
                          }}
                        >
                          {value ? (
                            <>
                              {shownValue}
                              {isTyping && <span style={{ opacity: 0.8 }}>|</span>}
                            </>
                          ) : (
                            'Dato mancante'
                          )}
                        </span>
                        {value ? (
                          <Check size={12} style={{ color: '#22c55e' }} />
                        ) : (
                          <span style={{ fontSize: 10, color: '#991b1b' }}>!</span>
                        )}
                      </div>
                    );
                  })}

                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left: fakeCursor.x,
                      top: fakeCursor.y,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: fakeCursor.clicking ? '#22c55e' : '#0b1136',
                      border: '2px solid #ffffff',
                      boxShadow: fakeCursor.clicking
                        ? '0 0 0 6px rgba(34, 197, 94, 0.2)'
                        : '0 1px 6px rgba(11, 17, 54, 0.35)',
                      transform: fakeCursor.clicking ? 'scale(1.08)' : 'scale(1)',
                      transition: 'left 220ms ease, top 220ms ease, transform 120ms ease, box-shadow 120ms ease, background 120ms ease',
                      pointerEvents: 'none',
                    }}
                  />
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
