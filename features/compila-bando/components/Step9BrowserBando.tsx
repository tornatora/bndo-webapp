'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Check, Loader2, Send } from 'lucide-react';
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

type Phase = 'spid-login' | 'spid-auth-wait' | 'spid-authenticated' | 'auto-filling' | 'uploading-docs' | 'ready-to-submit' | 'submitted';

export function Step9BrowserBando({
  extracted,
  spidAuthenticated,
  onSpidLogin,
  onComplete,
}: Props) {
  const [phase, setPhase] = useState<Phase>('spid-login');
  const { fillingFields, completedFields, isRunning, allDone, startAutoFill } = useAutoFill();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [sessionError, setSessionError] = useState('');

  const fieldValues: Record<string, string> = {};
  FORM_FIELDS.forEach((f) => {
    if (extracted[f.key]) fieldValues[f.label] = extracted[f.key];
  });

  const handleSpidClick = useCallback(async () => {
    setPhase('spid-auth-wait');
    setIframeLoaded(true);
    onSpidLogin();

    // Chiamata API auto-fill per creare sessione BrowserBase
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

      const json = await res.json();
      if (json.status === 'demo') {
        setSessionError('BrowserBase non configurato. Uso simulazione.');
      }
    } catch (e) {
      setSessionError(e instanceof Error ? e.message : 'Errore sessione BrowserBase');
    }

    setTimeout(() => {
      setPhase('spid-authenticated');
    }, 2500);

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
  }, [onSpidLogin, fieldValues, startAutoFill, extracted]);

  const handleSubmit = useCallback(() => {
    setPhase('submitted');
    setTimeout(onComplete, 800);
  }, [onComplete]);

  return (
    <div>
      <h2 className={s.cbCardTitle} style={{ marginBottom: 4 }}>
        Compilazione Bando su bndo.it
      </h2>
      <p className={s.cbCardSubtitle} style={{ marginBottom: 20 }}>
        {phase === 'spid-login' || phase === 'spid-auth-wait'
          ? 'Accedi con SPID per autenticarti sul portale Invitalia.'
          : phase === 'spid-authenticated'
          ? 'Accesso completato. L\'Agente AI inizierà la compilazione automatica.'
          : phase === 'auto-filling'
          ? 'L\'Agente AI sta compilando i campi del bando...'
          : phase === 'uploading-docs'
          ? 'Caricamento dei documenti generati in corso...'
          : phase === 'ready-to-submit'
          ? 'Tutti i campi sono stati compilati. Verifica e invia la domanda.'
          : 'Domanda inviata con successo!'}
      </p>

      {sessionError && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12,
          padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8
        }}>
          <span style={{ fontSize: 13, color: '#991b1b' }}>{sessionError}</span>
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
            {phase === 'spid-login' || phase === 'spid-auth-wait'
              ? 'minervaorgb2c.b2clogin.com — Accesso SPID Invitalia'
              : phase === 'spid-authenticated' || phase === 'auto-filling' || phase === 'uploading-docs' || phase === 'ready-to-submit'
              ? 'invitalia-areariservata.npi.invitalia.it — Area Riservata'
              : 'invitalia.it — Domanda inviata'}
          </div>
        </div>

        <div className={s.cbBrowserContent}>
          {(phase === 'spid-login' || phase === 'spid-auth-wait') && (
            <>
              {!iframeLoaded ? (
                <div style={{ padding: 32, textAlign: 'center' }}>
                  <div className={`${s.cbSpidStatus} ${s.cbSpidStatusWaiting}`}>
                    <Loader2 size={16} className={s.cbSpinner} />
                    Caricamento pagina di login SPID...
                  </div>
                  <button className={s.cbBtnGreen} onClick={handleSpidClick} type="button" style={{ marginTop: 16 }}>
                    Accedi con SPID
                  </button>
                </div>
              ) : phase === 'spid-auth-wait' ? (
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
              ) : null}
            </>
          )}

          {(phase === 'spid-authenticated' || phase === 'auto-filling' || phase === 'uploading-docs' || phase === 'ready-to-submit') && (
            <div className={`${s.cbSpidStatus} ${s.cbSpidStatusAuth}`} style={{ margin: 16 }}>
              <Check size={16} />
              Autenticato come: MARIO ROSSI — Invitalia Area Riservata
            </div>
          )}

          {(phase === 'auto-filling' || phase === 'uploading-docs' || phase === 'ready-to-submit') && (
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
                  <div className={s.cbAutofillSectionTitle}>
                    Caricamento Documenti
                  </div>
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
                    <div key={name} className={`${s.cbAutofillField} ${phase === 'ready-to-submit' ? s.cbAutofillFieldDone : ''}`}>
                      <span className={s.cbAutofillFieldLabel}>Allegato {i + 1}</span>
                      <span className={s.cbAutofillFieldValue} style={{ color: phase === 'ready-to-submit' ? '#16a34a' : '#0b1136' }}>{name}</span>
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

          {phase === 'ready-to-submit' && (
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px 24px', background: '#ffffff', borderTop: '1px solid #e8ecf4', zIndex: 3, textAlign: 'center' }}>
              <button className={s.cbInviaBtn} onClick={handleSubmit} type="button">
                <Send size={16} />
                Invia Domanda
              </button>
            </div>
          )}

          {phase === 'submitted' && (
            <div style={{ padding: 40, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <div className={s.cbSuccessCheck} style={{ width: 56, height: 56 }}>
                <Check size={28} strokeWidth={3} />
              </div>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#0b1136', margin: '12px 0 4px' }}>
                Domanda Inviata!
              </p>
              <p style={{ fontSize: 12, color: '#64748b' }}>
                Reindirizzamento in corso...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
