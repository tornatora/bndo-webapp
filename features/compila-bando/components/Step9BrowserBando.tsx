'use client';

import { useEffect, useState, useCallback } from 'react';
import { Check, Loader2, Send, ExternalLink } from 'lucide-react';
import { useAutoFill } from '../hooks/useAutoFill';
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
  | 'spid-authenticated'
  | 'auto-filling'
  | 'uploading-docs'
  | 'ready-to-submit'
  | 'submitted';

interface AutoFillApiResponse {
  status: 'live' | 'demo';
  client: Record<string, string>;
  liveViewUrl?: string | null;
  browserbaseSessionId?: string | null;
  flowTemplate?: { name: string; bandoKey: string; stepsCount: number; expectedDurationSeconds: number } | null;
  error?: string;
}

export function Step9BrowserBando({ extracted, spidAuthenticated, onSpidLogin, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [liveViewUrl, setLiveViewUrl] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [apiResult, setApiResult] = useState<AutoFillApiResponse | null>(null);
  const { fillingFields, completedFields, allDone, startAutoFill } = useAutoFill();

  const fieldValues: Record<string, string> = {};
  FORM_FIELDS.forEach((f) => {
    if (extracted[f.key]) fieldValues[f.label] = extracted[f.key];
  });

  const callAutoFillApi = useCallback(async () => {
    try {
      const res = await fetch('/api/compila-bando/auto-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: extracted }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '' }));
        throw new Error(err.error || `Errore ${res.status}`);
      }

      const json: AutoFillApiResponse = await res.json();
      setApiResult(json);

      if (json.status === 'live' && json.liveViewUrl) {
        setLiveViewUrl(json.liveViewUrl);
        setIsLive(true);
      } else if (json.status === 'demo') {
        setIsLive(false);
      }
    } catch (e) {
      setSessionError(e instanceof Error ? e.message : 'Errore avvio sessione');
      setIsLive(false);
    }
  }, [extracted]);

  // Avvia la chiamata API all'inizio
  useEffect(() => {
    void callAutoFillApi().then(() => setPhase('spid-login'));
  }, [callAutoFillApi]);

  const handleSpidClick = useCallback(async () => {
    setPhase('spid-auth-wait');
    onSpidLogin();

    // Simula autenticazione SPID
    setTimeout(() => {
      setPhase('spid-authenticated');
    }, 2500);

    // Dopo autenticazione, avvia auto-fill animato
    setTimeout(() => {
      setPhase('auto-filling');
      startAutoFill(fieldValues, () => {
        setTimeout(() => {
          setPhase('uploading-docs');
          setTimeout(() => {
            setPhase('ready-to-submit');
          }, 2000);
        }, 600);
      });
    }, 3500);
  }, [onSpidLogin, fieldValues, startAutoFill]);

  const handleSubmit = useCallback(() => {
    setPhase('submitted');
    setTimeout(onComplete, 800);
  }, [onComplete]);

  const spidLoginUrl =
    'https://minervaorgb2c.b2clogin.com/minervaorgb2c.onmicrosoft.com/b2c_1a_invitalia_signin/oauth2/v2.0/authorize' +
    '?client_id=74cea3c0-5ab9-4414-bf4d-9c80b9824a9f' +
    '&scope=openid%20profile%20offline_access' +
    '&redirect_uri=https%3A%2F%2Finvitalia-areariservata-fe.npi.invitalia.it%2Fhome' +
    '&response_mode=fragment&response_type=code&x-client-SKU=msal.js.browser&x-client-VER=2.32.2&client_info=1';

  return (
    <div>
      <h2 className={s.cbCardTitle} style={{ marginBottom: 4 }}>
        Compilazione Bando su Invitalia
      </h2>
      <p className={s.cbCardSubtitle} style={{ marginBottom: 20 }}>
        {phase === 'loading'
          ? 'Avvio sessione browser...'
          : phase === 'spid-login' || phase === 'spid-auth-wait'
          ? 'Accedi con SPID per autenticarti sul portale Invitalia.'
          : phase === 'spid-authenticated'
          ? 'Accesso completato. L\'Agente AI iniziera la compilazione automatica.'
          : phase === 'auto-filling'
          ? 'L\'Agente AI sta compilando i campi del bando...'
          : phase === 'uploading-docs'
          ? 'Caricamento dei documenti generati in corso...'
          : phase === 'ready-to-submit'
          ? 'Tutti i campi sono stati compilati. Verifica e invia la domanda.'
          : 'Domanda inviata con successo!'}
      </p>

      {sessionError && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 12,
            padding: '12px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 13, color: '#991b1b' }}>{sessionError}</span>
        </div>
      )}

      {isLive && liveViewUrl && (
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
          Sessione Browserbase attiva &middot; Browser reale in esecuzione
          <a
            href={liveViewUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, color: '#059669', textDecoration: 'underline' }}
          >
            <ExternalLink size={12} />
            Apri in nuova finestra
          </a>
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
              : phase === 'spid-authenticated' || phase === 'auto-filling' || phase === 'uploading-docs' || phase === 'ready-to-submit'
              ? 'invitalia-areariservata.npi.invitalia.it — Area Riservata'
              : 'invitalia.it — Domanda inviata'}
          </div>
        </div>

        <div className={s.cbBrowserContent}>
          {/* Browserbase Live View: mostra la pagina SPID reale */}
          {(phase === 'spid-login' || phase === 'spid-auth-wait') && isLive && liveViewUrl && (
            <iframe
              src={liveViewUrl}
              style={{ width: '100%', height: '100%', border: 'none', borderRadius: '0 0 12px 12px' }}
              title="Browserbase Live View - SPID Login"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          )}

          {/* Versione simulata (DEMO) quando Browserbase non e disponibile */}
          {(phase === 'spid-login' || phase === 'spid-auth-wait') && !isLive && (
            <>
              {phase === 'spid-login' && (
                <div style={{ padding: 32, textAlign: 'center' }}>
                  <div className={`${s.cbSpidStatus} ${s.cbSpidStatusWaiting}`}>
                    <Loader2 size={16} className={s.cbSpinner} />
                    Pagina di login SPID pronta
                  </div>
                  <button className={s.cbBtnGreen} onClick={handleSpidClick} type="button" style={{ marginTop: 16 }}>
                    Accedi con SPID
                  </button>
                  <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 12 }}>
                    DEMO MODE — Browserbase non configurato. L&apos;autenticazione e simulata.
                  </p>
                </div>
              )}

              {phase === 'spid-auth-wait' && (
                <div style={{ padding: 32, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <div style={{ marginBottom: 24, padding: 16, background: '#f0f2f5', borderRadius: 12, maxWidth: 320 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#0b1136', margin: '0 0 12px' }}>
                      Scegli il tuo provider SPID
                    </p>
                    {['Poste Italiane', 'Aruba', 'Sielte', 'Infocert'].map((p, i) => (
                      <div
                        key={p}
                        style={{
                          padding: '10px 14px',
                          margin: '0 0 6px',
                          background: i === 0 ? 'rgba(34,197,95,0.08)' : '#ffffff',
                          border: i === 0 ? '1px solid rgba(34,197,95,0.3)' : '1px solid #e8ecf4',
                          borderRadius: 10,
                          fontSize: 13,
                          fontWeight: i === 0 ? 600 : 400,
                          color: i === 0 ? '#16a34a' : '#0b1136',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        {i === 0 && <Check size={14} />}
                        {p}
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 12, color: '#64748b' }}>
                    Autenticazione in corso con Poste Italiane...
                  </p>
                  <Loader2 size={16} className={s.cbSpinner} style={{ marginTop: 8 }} />
                </div>
              )}
            </>
          )}

          {/* Se Browserbase e live, mostra anche dopo il login */}
          {(phase === 'spid-authenticated' || phase === 'auto-filling' || phase === 'uploading-docs' || phase === 'ready-to-submit') && isLive && liveViewUrl && (
            <iframe
              src={liveViewUrl}
              style={{ width: '100%', height: '100%', border: 'none', borderRadius: '0 0 12px 12px' }}
              title="Browserbase Live View - Invitalia"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          )}

          {/* Autenticazione completata badge */}
          {(phase === 'spid-authenticated' || phase === 'auto-filling' || phase === 'uploading-docs' || phase === 'ready-to-submit') && (
            <div className={`${s.cbSpidStatus} ${s.cbSpidStatusAuth}`} style={{ margin: isLive ? 0 : 16, position: isLive ? 'absolute' : 'static', top: isLive ? 8 : 'auto', left: isLive ? 8 : 'auto', zIndex: 2 }}>
              <Check size={16} />
              {isLive
                ? 'Browser Live — Invitalia Area Riservata'
                : 'Autenticato come: MARIO ROSSI — Invitalia Area Riservata'}
            </div>
          )}

          {/* Auto-fill overlay (DEMO) */}
          {!isLive && (phase === 'auto-filling' || phase === 'uploading-docs' || phase === 'ready-to-submit') && (
            <div className={s.cbAutofillOverlay}>
              {allDone && (
                <div className={s.cbAutofillDoneBanner}>
                  <p className={s.cbAutofillDoneTitle}>Tutti i campi compilati</p>
                  <p className={s.cbAutofillDoneSub}>
                    L&apos;Agente AI ha completato l&apos;inserimento di tutti i dati
                  </p>
                </div>
              )}

              {FORM_FIELDS.map((f) => {
                const label = f.label;
                const isFieldDone = completedFields.has(label);
                const isFieldFilling = !isFieldDone && fillingFields[label] !== undefined;
                const displayValue = fillingFields[label] ?? (isFieldDone ? extracted[f.key] : '');

                return (
                  <div
                    key={f.key}
                    className={`${s.cbAutofillField} ${
                      isFieldDone
                        ? s.cbAutofillFieldDone
                        : isFieldFilling
                        ? s.cbAutofillFieldFilling
                        : ''
                    }`}
                  >
                    <span className={s.cbAutofillFieldLabel}>{label}</span>
                    <span className={s.cbAutofillFieldValue}>
                      {isFieldDone ? (
                        <span style={{ color: '#16a34a' }}>{displayValue}</span>
                      ) : isFieldFilling ? (
                        <>
                          {displayValue}
                          <span style={{ animation: 'cb-pulse 0.8s step-end infinite', color: '#22c55f' }}>|</span>
                        </>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>In attesa...</span>
                      )}
                    </span>
                    {isFieldDone && (
                      <div className={s.cbAutofillFieldCheck}>
                        <Check size={12} strokeWidth={4} />
                      </div>
                    )}
                    {isFieldFilling && !isFieldDone && (
                      <Loader2 size={14} className={s.cbSpinner} style={{ color: '#22c55f' }} />
                    )}
                  </div>
                );
              })}

              {phase === 'uploading-docs' && (
                <div style={{ marginTop: 16 }}>
                  <div className={s.cbAutofillSectionTitle}>Caricamento Documenti</div>
                  {['Scheda-Aziendale-BNDO.pdf', 'Documento-Anagrafico-BNDO.docx'].map((name, i) => (
                    <div key={name} className={`${s.cbAutofillField} ${s.cbAutofillFieldFilling}`}>
                      <span className={s.cbAutofillFieldLabel}>Allegato {i + 1}</span>
                      <span className={s.cbAutofillFieldValue}>{name}</span>
                      <Loader2 size={14} className={s.cbSpinner} style={{ color: '#22c55f' }} />
                    </div>
                  ))}
                </div>
              )}

              {(phase === 'uploading-docs' || phase === 'ready-to-submit') && (
                <div style={{ marginTop: 8 }}>
                  {['Scheda-Aziendale-BNDO.pdf', 'Documento-Anagrafico-BNDO.docx'].map((name, i) => (
                    <div
                      key={name}
                      className={`${s.cbAutofillField} ${phase === 'ready-to-submit' ? s.cbAutofillFieldDone : ''}`}
                    >
                      <span className={s.cbAutofillFieldLabel}>Allegato {i + 1}</span>
                      <span className={s.cbAutofillFieldValue} style={{ color: phase === 'ready-to-submit' ? '#16a34a' : '#0b1136' }}>
                        {name}
                      </span>
                      {phase === 'ready-to-submit' ? (
                        <div className={s.cbAutofillFieldCheck}>
                          <Check size={12} strokeWidth={4} />
                        </div>
                      ) : (
                        <Loader2 size={14} className={s.cbSpinner} style={{ color: '#22c55f' }} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Bottone invio domanda */}
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

          {/* Stato inviato */}
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
      </div>
    </div>
  );
}
