'use client';

import { FormEvent, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

export default function DashboardPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsError(false);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setIsError(true);
      setMessage('Compila tutti i campi.');
      return;
    }

    if (newPassword.length < 8) {
      setIsError(true);
      setMessage('La nuova password deve avere almeno 8 caratteri.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setIsError(true);
      setMessage('Le nuove password non coincidono.');
      return;
    }

    setSaving(true);

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user?.email) {
      setSaving(false);
      setIsError(true);
      setMessage('Sessione non valida. Effettua di nuovo il login.');
      return;
    }

    const verify = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword
    });

    if (verify.error) {
      setSaving(false);
      setIsError(true);
      setMessage('Password attuale non corretta.');
      return;
    }

    const update = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);

    if (update.error) {
      setIsError(true);
      setMessage('Impossibile aggiornare la password. Riprova.');
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setIsError(false);
    setMessage('Password aggiornata correttamente.');
  }

  return (
    <section className="welcome-section" style={{ maxWidth: 760 }}>
      <h1 className="welcome-title">🔐 Sicurezza account</h1>
      <p className="welcome-subtitle" style={{ marginBottom: 24 }}>
        Cambia la password del tuo account utente.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label" htmlFor="currentPassword">
            Password attuale
          </label>
          <input
            id="currentPassword"
            type="password"
            className="form-input"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="newPassword">
            Nuova password
          </label>
          <input
            id="newPassword"
            type="password"
            className="form-input"
            minLength={8}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
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
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </div>

        {message ? (
          <p style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600, color: isError ? '#b91c1c' : '#15803d' }}>{message}</p>
        ) : null}

        <button type="submit" className="btn-action primary" disabled={saving}>
          {saving ? 'Salvataggio...' : 'Aggiorna password'}
        </button>
      </form>
    </section>
  );
}
