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
  const fullNameFallback = extracted.nome_legale_rappresentante?.trim() || 'Mario Rossi';
  return {
    firstName: fullNameFallback.split(' ')[0] || 'Mario',
    lastName: fullNameFallback.split(' ').slice(1).join(' ') || 'Rossi',
    fullName: fullNameFallback,
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

export function Step10BrowserBando({
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
  const [progressPercent, setProgressPercent] = useState(0);
  const [typingIndex, setTypingIndex] = useState(0);
  const [typingChar, setTypingChar] = useState(0);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
  const formPreviewRef = useRef<HTMLDivElement | null>(null);
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const initRef = useRef(false);
  const hasStartedRef = useRef(false);
  const authRedirectSeenRef = useRef(false);
  const executeAbortRef = useRef<AbortController | null>(null);
  const spidWindowRef = useRef<Window | null>(null);

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
    setProgressPercent(0);
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
      // Readiness check is BEST-EFFORT only: it must never block the core SPID -> execute-flow pipeline.
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
        const readiness = (await readinessRes.json().catch(() => ({}))) as ReadinessResponse;
        if (readinessRes.ok && 'ok' in readiness && readiness.ok) {
          setResolvedApplicationId(readiness.applicationId || applicationId || null);
          if (!readiness.ready) {
            setMissingFields(readiness.missingFields || []);
            setMissingDocuments(readiness.missingDocuments || []);
            setFlowResult(
              'Mancano alcuni dati/documenti. Per ora proseguiamo comunque: fai SPID e avviamo la compilazione automatica per testare il core.'
            );
          }
        } else {
          setFlowResult('Controllo completezza non disponibile: proseguiamo comunque con SPID e compilazione (test core).');
        }
      } catch {
        setFlowResult('Controllo completezza non disponibile: proseguiamo comunque con SPID e compilazione (test core).');
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
    const url = session?.liveViewUrl || 'https://www.invitalia.it/';
    // Prefer a wide popup so the Browserbase live view isn't squashed (Invitalia is a desktop UI).
    const maxW = Math.max(820, Math.floor((window.screen?.availWidth || 1280) * 0.86));
    const maxH = Math.max(680, Math.floor((window.screen?.availHeight || 800) * 0.86));
    const popupWidth = Math.min(1280, maxW);
    const popupHeight = Math.min(860, maxH);
    const left = Math.max(0, Math.floor(window.screenX + (window.outerWidth - popupWidth) / 2));
    const top = Math.max(0, Math.floor(window.screenY + (window.outerHeight - popupHeight) / 2));
    const features = [
      'popup=yes',
      `width=${popupWidth}`,
      `height=${popupHeight}`,
      `left=${left}`,
      `top=${top}`,
      'resizable=yes',
      'scrollbars=yes',
    ].join(',');
    // NOTE: we intentionally do not set `noopener` here because we want to auto-close
    // this popup as soon as login is detected (test/core UX requirement).
    const spidWindow = window.open(url, 'bndo_spid_live_view', features);
    spidWindowRef.current = spidWindow;
    const opened = Boolean(spidWindow);
    setSpidTabOpened(opened);
    setPhase('spid-auth-wait');
    setDisconnectNotice(opened ? null : 'Popup bloccato: abilita i popup per BNDO e riapri la scheda SPID.');
    setFlowResult(
      opened
        ? 'Scheda SPID aperta: torna qui, la compilazione parte automaticamente appena rileva il login.'
        : null
    );

    window.setTimeout(() => {
      try {
        spidWindow?.focus();
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
    setFlowResult('Accesso SPID rilevato: avvio compilazione automatica sul sito reale di Invitalia...');
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
            // Best-effort: close the SPID popup and refocus BNDO control center.
            // Some browsers may ignore a single close() call; retry briefly.
            const w = spidWindowRef.current;
            if (w) {
              try {
                // Navigate the popup back to BNDO so it can self-close reliably.
                w.location.replace(`${window.location.origin}/spid-done`);
              } catch {
                // ignore
              }
              for (let i = 0; i < 6; i += 1) {
                window.setTimeout(() => {
                  try {
                    w.close();
                  } catch {
                    // ignore
                  }
                }, i * 180);
              }
              spidWindowRef.current = null;
            }
            for (let i = 0; i < 4; i += 1) {
              window.setTimeout(() => {
                try {
                  window.focus();
                } catch {
                  // ignore
                }
              }, i * 250);
            }
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
    setProgressPercent(0);
    setTypingIndex(0);
    setTypingChar(0);

    const runProgress = async () => {
      for (let i = 0; i <= 100; i += 2) {
        if (cancelled) return;
        setProgressPercent(i);
        await new Promise<void>((resolve) => setTimeout(resolve, 120));
      }
    };

    void runProgress();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  // Fake typing animation shown in dashboard (real compilation happens in background).
  useEffect(() => {
    if (phase !== 'auto-filling') return;

    const payload = buildClientPayload(extracted);
    const fields = [
      { key: 'tipologiaProponente', label: 'Tipologia proponente', value: 'Voucher Lavoratore autonomo-libero professionista' },
      { label: 'Nome', value: payload.firstName || 'Mario' },
      { label: 'Cognome', value: payload.lastName || 'Rossi' },
      { label: 'Codice fiscale', value: payload.codiceFiscale || 'RSSMRA80A01H501U' },
      { label: 'PEC', value: payload.pec || 'demo@pec.it' },
      { label: 'Telefono', value: payload.phone || '+39 340 000 0000' },
    ];

    let alive = true;
    const timer = window.setInterval(() => {
      if (!alive) return;
      setTypingChar((prev) => {
        const current = fields[typingIndex]?.value || '';
        const next = prev + 1;
        if (next <= current.length) return next;
        // move to next field
        setTypingIndex((idx) => (idx + 1) % fields.length);
        return 0;
      });
    }, 28);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, extracted, typingIndex]);

  useEffect(() => {
    if (phase !== 'auto-filling') {
      setCursorPos((p) => ({ ...p, visible: false }));
      return;
    }

    // Move fake cursor to the active field in the BNDO form preview.
    const payload = buildClientPayload(extracted);
    const keys = [
      'tipologiaProponente',
      'Nome',
      'Cognome',
      'CodiceFiscale',
      'PEC',
      'Telefono',
    ];
    const currentKey = keys[Math.min(keys.length - 1, typingIndex)] || 'Nome';
    const el = fieldRefs.current[currentKey];
    const root = formPreviewRef.current;
    if (!el || !root) return;

    const er = el.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    const x = Math.max(6, Math.floor(er.left - rr.left + 12));
    const y = Math.max(6, Math.floor(er.top - rr.top + er.height / 2));
    setCursorPos({ x, y, visible: true });
  }, [phase, extracted, typingIndex]);

  const handleSubmit = useCallback(() => {
    setPhase('submitted');
    setTimeout(onComplete, 800);
  }, [onComplete]);

  const getPhaseLabel = () => {
    switch (phase) {
      case 'loading': return 'Avvio sessione browser cloud...';
      case 'spid-login': return 'Browser cloud connesso — autenticati con SPID per proseguire';
      case 'spid-auth-wait': return 'Completa l\'autenticazione SPID nella scheda aperta. Appena hai finito, la compilazione parte da sola.';
      case 'auto-filling': return 'L\'Agente AI sta compilando la domanda sul sito reale di Invitalia in background...';
      case 'uploading-docs': return 'Upload documenti in corso...';
      case 'ready-to-submit': return 'Compilazione completata! Pronto per l\'invio.';
      case 'submitted': return 'Domanda inviata con successo!';
      default: return '';
    }
  };

  return (
    <div>
      <h2 className={s.cbCardTitle} style={{ marginBottom: 4 }}>
        Compilazione Bando su Invitalia
      </h2>
      <p className={s.cbCardSubtitle} style={{ marginBottom: 20 }}>
        {getPhaseLabel()}
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
          Autenticato come: {extracted.nome_legale_rappresentante || 'MARIO ROSSI'} — Invitalia Area Riservata
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
          <strong style={{ display: 'block', marginBottom: 6 }}>Blocco pre-compilazione: completa prima questi elementi</strong>
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

      {/* Control Center */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, background: '#ffffff' }}>
        {/* Header stato */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: phase === 'auto-filling' || phase === 'uploading-docs' ? '#f0fdf4' : '#f1f5f9',
              display: 'grid',
              placeItems: 'center',
            }}>
              {phase === 'loading' ? (
                <Loader2 size={18} className={s.cbSpinner} />
              ) : phase === 'auto-filling' || phase === 'uploading-docs' ? (
                <Loader2 size={18} className={s.cbSpinner} style={{ color: '#22c55e' }} />
              ) : phase === 'ready-to-submit' || phase === 'submitted' ? (
                <Check size={18} style={{ color: '#22c55e' }} />
              ) : (
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6' }} />
              )}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0b1136' }}>
                {phase === 'loading' ? 'Connessione in corso...'
                  : phase === 'spid-login' ? 'In attesa di SPID'
                  : phase === 'spid-auth-wait' ? 'Autenticazione SPID in corso'
                  : phase === 'auto-filling' ? 'Compilazione automatica attiva'
                  : phase === 'uploading-docs' ? 'Caricamento documenti'
                  : phase === 'ready-to-submit' ? 'Pronto per invio'
                  : 'Completato'}
              </p>
              <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>
                {statusHint ? `Stato remoto: ${statusHint}` : 'In attesa di aggiornamenti dal browser cloud...'}
                {statusLastSeenAt ? ` · Ultimo check: ${new Date(statusLastSeenAt).toLocaleTimeString('it-IT')}` : ''}
              </p>
            </div>
          </div>
        </div>

      {/* Progress bar per auto-filling */}
      {phase === 'auto-filling' && (
        <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#0b1136' }}>Progresso compilazione</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>{progressPercent}%</span>
            </div>
            <div style={{ width: '100%', height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                width: `${progressPercent}%`,
                height: '100%',
                background: '#22c55e',
                borderRadius: 4,
                transition: 'width 120ms ease',
              }} />
            </div>
        </div>
      )}

      {/* Typing animation (UX only) */}
      {phase === 'auto-filling' && (
        <div
          ref={formPreviewRef}
          style={{
            marginBottom: 16,
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 16,
            background: '#ffffff',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, color: '#0b1136' }}>
            Compilazione in corso
          </p>
          {cursorPos.visible && (
            <div
              style={{
                position: 'absolute',
                left: cursorPos.x,
                top: cursorPos.y,
                width: 16,
                height: 16,
                transform: 'translate(-6px, -50%)',
                pointerEvents: 'none',
                transition: 'left 220ms ease, top 220ms ease',
                zIndex: 5,
              }}
            >
              <div
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '8px solid #0b1136',
                  borderTop: '6px solid transparent',
                  borderBottom: '6px solid transparent',
                  filter: 'drop-shadow(0 4px 10px rgba(11,17,54,0.25))',
                }}
              />
            </div>
          )}
          {(() => {
            const payload = buildClientPayload(extracted);
            const fields = [
              { key: 'tipologiaProponente', label: 'Tipologia proponente', value: 'Voucher Lavoratore autonomo-libero professionista' },
              { key: 'Nome', label: 'Nome', value: payload.firstName || 'Mario' },
              { key: 'Cognome', label: 'Cognome', value: payload.lastName || 'Rossi' },
              { key: 'CodiceFiscale', label: 'Codice fiscale', value: payload.codiceFiscale || 'RSSMRA80A01H501U' },
              { key: 'PEC', label: 'PEC', value: payload.pec || 'demo@pec.it' },
              { key: 'Telefono', label: 'Telefono', value: payload.phone || '+39 340 000 0000' },
            ];
            return (
              <div style={{ display: 'grid', gap: 8 }}>
                {fields.map((f, idx) => {
                  const isActive = idx === typingIndex;
                  const shown = idx < typingIndex ? f.value : isActive ? f.value.slice(0, typingChar) : '';
                  return (
                    <div key={f.label} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#334155', fontWeight: 700 }}>{f.label}</span>
                      <div style={{
                        height: 34,
                        borderRadius: 10,
                        border: `1px solid ${isActive ? '#86efac' : '#e2e8f0'}`,
                        background: isActive ? '#f0fdf4' : '#f8fafc',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 10px',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace',
                        fontSize: 12,
                        color: '#0b1136',
                        position: 'relative',
                        overflow: 'hidden',
                      }}>
                        <div
                          ref={(node) => {
                            fieldRefs.current[f.key as string] = node;
                          }}
                          style={{ position: 'absolute', inset: 0 }}
                        />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shown}</span>
                        {isActive && (
                          <span
                            style={{
                              width: 7,
                              height: 16,
                              background: '#0b1136',
                              marginLeft: 2,
                              opacity: 0.75,
                              animation: 'cbBlink 1s step-end infinite',
                            }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

        {/* Azioni principali */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {phase === 'spid-login' || phase === 'spid-auth-wait' ? (
            <>
              <button className={s.cbBtnGreen} type="button" onClick={handleOpenSpidTab} disabled={isExecuting}>
                {isExecuting ? <Loader2 size={14} className={s.cbSpinner} /> : <Check size={14} />}
                {phase === 'spid-auth-wait' ? 'Riapri SPID' : session ? 'Accedi con SPID (nuova scheda)' : 'Accedi con SPID su Invitalia'}
              </button>
              <button className={s.cbBtnMuted} type="button" onClick={handleStop}>
                <OctagonX size={14} />
                Stop
              </button>
            </>
          ) : phase === 'auto-filling' || phase === 'uploading-docs' ? (
            <button className={s.cbBtnMuted} type="button" onClick={handleStop} disabled={!isExecuting}>
              <OctagonX size={14} />
              Interrompi compilazione
            </button>
          ) : phase === 'ready-to-submit' ? (
            <button className={s.cbInviaBtn} onClick={handleSubmit} type="button">
              <Send size={16} />
              Invia Domanda
            </button>
          ) : phase === 'submitted' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#166534', fontSize: 13, fontWeight: 600 }}>
              <Check size={16} />
              Domanda inviata con successo!
            </div>
          ) : (
            <button className={s.cbBtnMuted} onClick={handleRetrySession} type="button" disabled={isInitializing}>
              {isInitializing ? <Loader2 size={14} className={s.cbSpinner} /> : <RefreshCcw size={14} />}
              Riprova connessione
            </button>
          )}
        </div>

        {/* Session info */}
        {session?.sessionExpiresAt && (
          <p style={{ margin: '10px 0 0', fontSize: 11, color: '#94a3b8' }}>
            Sessione scade: {session.sessionExpiresAt}
          </p>
        )}
      </div>
    </div>
  );
}
