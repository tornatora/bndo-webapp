'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

type Stage = 'checking' | 'ready' | 'done' | 'error';

export default function ResetPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const [stage, setStage] = useState<Stage>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function initializeRecoverySession() {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const tokenHash = url.searchParams.get('token_hash');
      const type = url.searchParams.get('type');

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setStage('error');
          setMessage('Link non valido o scaduto. Richiedi un nuovo reset password.');
          return;
        }
      } else if (tokenHash && type === 'recovery') {
        const { error } = await supabase.auth.verifyOtp({
          type: 'recovery',
          token_hash: tokenHash
        });
        if (error) {
          setStage('error');
          setMessage('Link non valido o scaduto. Richiedi un nuovo reset password.');
          return;
        }
      }

      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        setStage('error');
        setMessage('Sessione di recupero non trovata. Apri il link ricevuto via email.');
        return;
      }

      setStage('ready');
    }

    void initializeRecoverySession();
  }, [supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (password.length < 8) {
      setMessage('La password deve avere almeno 8 caratteri.');
      return;
    }

    if (password !== confirmPassword) {
      setMessage('Le password non coincidono.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      setMessage('Impossibile aggiornare la password. Richiedi un nuovo link di recupero.');
      return;
    }

    setStage('done');
    setMessage('Password aggiornata con successo. Ora puoi accedere.');
  }

  return (
    <section className="login-hero">
      <div className="login-content">
        <div className="login-header">
          <div className="login-badge">
            <span>🔑</span>
            <span>Nuova password</span>
          </div>
          <h1 className="login-title">Reimposta password</h1>
          <p className="login-subtitle">Imposta una nuova password sicura per il tuo account BNDO.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {stage === 'checking' ? <p style={{ marginBottom: '16px', color: 'var(--text-light)' }}>Verifica link in corso...</p> : null}

          {stage === 'ready' ? (
            <>
              <div className="form-group">
                <label className="form-label" htmlFor="password">
                  Nuova password
                </label>
                <input
                  id="password"
                  type="password"
                  className="form-input"
                  placeholder="Almeno 8 caratteri"
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="confirmPassword">
                  Conferma nuova password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  className="form-input"
                  placeholder="Ripeti la password"
                  minLength={8}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-login" disabled={saving}>
                <span>{saving ? 'Salvataggio...' : 'Aggiorna password →'}</span>
              </button>
            </>
          ) : null}

          {message ? (
            <p
              style={{
                marginTop: '16px',
                fontSize: '14px',
                fontWeight: 600,
                color: stage === 'done' ? '#15803d' : '#b91c1c'
              }}
            >
              {message}
            </p>
          ) : null}

          {(stage === 'done' || stage === 'error') && (
            <p style={{ marginTop: '16px', fontSize: '14px', color: 'var(--text-light)' }}>
              Vai al{' '}
              <Link href="/login" style={{ color: 'var(--navy)', fontWeight: 600 }}>
                login
              </Link>
              .
            </p>
          )}

          {stage === 'error' && (
            <p style={{ marginTop: '8px', fontSize: '14px', color: 'var(--text-light)' }}>
              Puoi richiedere un nuovo link da{' '}
              <Link href="/forgot-password" style={{ color: 'var(--navy)', fontWeight: 600 }}>
                questa pagina
              </Link>
              .
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
