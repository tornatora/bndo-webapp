'use client';

import { FormEvent, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

type ProfileSettingsProps = {
  initialProfile: {
    fullName: string;
    username: string;
    email: string;
  };
  initialCompany: {
    name: string;
    vatNumber: string | null;
    industry: string | null;
    annualSpendTarget: number | null;
  } | null;
};

type ApiResponse = {
  error?: string;
};

export function ProfileSettings({ initialProfile, initialCompany }: ProfileSettingsProps) {
  const supabase = useMemo(() => createClient(), []);

  const [fullName, setFullName] = useState(initialProfile.fullName);
  const [username, setUsername] = useState(initialProfile.username);
  const [email] = useState(initialProfile.email);
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [personalMessage, setPersonalMessage] = useState<string | null>(null);
  const [personalError, setPersonalError] = useState(false);

  const [companyName, setCompanyName] = useState(initialCompany?.name ?? '');
  const [vatNumber, setVatNumber] = useState(initialCompany?.vatNumber ?? '');
  const [industry, setIndustry] = useState(initialCompany?.industry ?? '');
  const [annualSpendTarget, setAnnualSpendTarget] = useState(
    initialCompany?.annualSpendTarget ? String(initialCompany.annualSpendTarget) : ''
  );
  const [savingBilling, setSavingBilling] = useState(false);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [billingError, setBillingError] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState(false);

  async function handlePersonalSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPersonalMessage(null);
    setPersonalError(false);

    if (!fullName.trim() || !username.trim()) {
      setPersonalError(true);
      setPersonalMessage('Nome e username sono obbligatori.');
      return;
    }

    setSavingPersonal(true);

    try {
      const response = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'personal',
          fullName,
          username
        })
      });

      const payload = (await response.json().catch(() => ({}))) as ApiResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? 'Errore salvataggio dati account.');
      }

      setPersonalMessage('Dati account aggiornati correttamente.');
      setPersonalError(false);
    } catch (error) {
      setPersonalError(true);
      setPersonalMessage(error instanceof Error ? error.message : 'Errore salvataggio dati account.');
    } finally {
      setSavingPersonal(false);
    }
  }

  async function handleBillingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBillingMessage(null);
    setBillingError(false);

    if (!companyName.trim()) {
      setBillingError(true);
      setBillingMessage('Il nome azienda è obbligatorio.');
      return;
    }

    const normalizedSpend = annualSpendTarget.trim().replace(',', '.');
    const parsedSpend = normalizedSpend ? Number(normalizedSpend) : null;

    if (normalizedSpend && Number.isNaN(parsedSpend)) {
      setBillingError(true);
      setBillingMessage('Importo annuo non valido.');
      return;
    }

    setSavingBilling(true);

    try {
      const response = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'billing',
          companyName,
          vatNumber,
          industry,
          annualSpendTarget: parsedSpend
        })
      });

      const payload = (await response.json().catch(() => ({}))) as ApiResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? 'Errore salvataggio dati fatturazione.');
      }

      setBillingMessage('Dati fatturazione aggiornati correttamente.');
      setBillingError(false);
    } catch (error) {
      setBillingError(true);
      setBillingMessage(error instanceof Error ? error.message : 'Errore salvataggio dati fatturazione.');
    } finally {
      setSavingBilling(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage(null);
    setPasswordError(false);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError(true);
      setPasswordMessage('Compila tutti i campi password.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError(true);
      setPasswordMessage('La nuova password deve avere almeno 8 caratteri.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError(true);
      setPasswordMessage('Le nuove password non coincidono.');
      return;
    }

    setSavingPassword(true);

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user?.email) {
      setSavingPassword(false);
      setPasswordError(true);
      setPasswordMessage('Sessione non valida. Effettua di nuovo il login.');
      return;
    }

    const verify = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword
    });

    if (verify.error) {
      setSavingPassword(false);
      setPasswordError(true);
      setPasswordMessage('Password attuale non corretta.');
      return;
    }

    const update = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);

    if (update.error) {
      setPasswordError(true);
      setPasswordMessage('Impossibile aggiornare la password. Riprova.');
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(false);
    setPasswordMessage('Password aggiornata correttamente.');
  }

  return (
    <div className="profile-sections">
      <section className="section-card profile-card">
        <h2 className="section-title">👤 Profilo Account</h2>
        <form onSubmit={handlePersonalSubmit} className="profile-form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="profileFullName">
              Nome e Cognome
            </label>
            <input
              id="profileFullName"
              type="text"
              className="form-input"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="profileUsername">
              Username
            </label>
            <input
              id="profileUsername"
              type="text"
              className="form-input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>

          <div className="form-group profile-form-grid-full">
            <label className="form-label" htmlFor="profileEmail">
              Email (login)
            </label>
            <input id="profileEmail" type="email" className="form-input" value={email} readOnly />
          </div>

          {personalMessage ? (
            <p className="profile-message" style={{ color: personalError ? '#b91c1c' : '#15803d' }}>
              {personalMessage}
            </p>
          ) : null}

          <div className="profile-form-grid-full">
            <button type="submit" className="btn-action primary" disabled={savingPersonal}>
              {savingPersonal ? 'Salvataggio...' : 'Salva dati account'}
            </button>
          </div>
        </form>
      </section>

      <section className="section-card profile-card">
        <h2 className="section-title">🧾 Dati Fatturazione</h2>
        <form onSubmit={handleBillingSubmit} className="profile-form-grid">
          <div className="form-group profile-form-grid-full">
            <label className="form-label" htmlFor="billingCompanyName">
              Ragione sociale
            </label>
            <input
              id="billingCompanyName"
              type="text"
              className="form-input"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="billingVatNumber">
              Partita IVA
            </label>
            <input
              id="billingVatNumber"
              type="text"
              className="form-input"
              value={vatNumber}
              onChange={(event) => setVatNumber(event.target.value)}
              placeholder="IT12345678901"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="billingIndustry">
              Settore
            </label>
            <input
              id="billingIndustry"
              type="text"
              className="form-input"
              value={industry}
              onChange={(event) => setIndustry(event.target.value)}
              placeholder="Edilizia, IT, Consulenza..."
            />
          </div>

          <div className="form-group profile-form-grid-full">
            <label className="form-label" htmlFor="billingAnnualSpend">
              Budget/Spesa annua target (EUR)
            </label>
            <input
              id="billingAnnualSpend"
              type="text"
              className="form-input"
              value={annualSpendTarget}
              onChange={(event) => setAnnualSpendTarget(event.target.value)}
              placeholder="50000"
            />
          </div>

          {billingMessage ? (
            <p className="profile-message" style={{ color: billingError ? '#b91c1c' : '#15803d' }}>
              {billingMessage}
            </p>
          ) : null}

          <div className="profile-form-grid-full">
            <button type="submit" className="btn-action primary" disabled={savingBilling}>
              {savingBilling ? 'Salvataggio...' : 'Salva dati fatturazione'}
            </button>
          </div>
        </form>
      </section>

      <section className="section-card profile-card">
        <h2 className="section-title">🔐 Sicurezza</h2>
        <form onSubmit={handlePasswordSubmit} className="profile-form-grid">
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

          <div className="form-group profile-form-grid-full">
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

          {passwordMessage ? (
            <p className="profile-message" style={{ color: passwordError ? '#b91c1c' : '#15803d' }}>
              {passwordMessage}
            </p>
          ) : null}

          <div className="profile-form-grid-full">
            <button type="submit" className="btn-action primary" disabled={savingPassword}>
              {savingPassword ? 'Salvataggio...' : 'Aggiorna password'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
