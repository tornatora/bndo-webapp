'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Loader2, UploadCloud } from 'lucide-react';
import { EmbeddedPracticeCheckout } from '@/components/landing/onboarding-wizard/EmbeddedPracticeCheckout';
import type { OnboardingDocumentRequirement, OnboardingMode } from '@/components/landing/onboarding-wizard/types';

type StepPaymentProps = {
  clientSecret: string | null;
  sessionId: string | null;
  error: string | null;
  checking: boolean;
  loading: boolean;
  onEmbeddedPaymentComplete: () => void;
  onEmbeddedPaymentError: (message: string) => void;
  onVerify: () => void;
  onPayLater: () => void;
};

type StepWelcomeProps = {
  mode?: OnboardingMode;
  showGuide: boolean;
  documentRequirements: OnboardingDocumentRequirement[];
  onCloseGuide: () => void;
};

type StepAccountSetupProps = {
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
};

type StepPecFirmaProps = {
  pec: string;
  digitalSignature: 'yes' | 'no' | '';
  onPecChange: (value: string) => void;
  onSignatureChange: (value: 'yes' | 'no' | '') => void;
};

type StepDocumentsProps = {
  mode?: OnboardingMode;
  applicationId?: string | null;
  pec: string;
  digitalSignature: 'yes' | 'no' | '';
  onPecChange: (value: string) => void;
  onSignatureChange: (value: 'yes' | 'no' | '') => void;
  requirements: OnboardingDocumentRequirement[];
  requirementFiles: Record<string, File | null>;
  requirementFileErrors: Record<string, string | null>;
  removedUploadedKeys: Set<string>;
  onRequirementFileChange: (requirementKey: string, file: File | null) => void;
};

type StepPreventiviProps = {
  quotesText: string;
  quotes: File[];
  onQuotesTextChange: (value: string) => void;
  onQuoteFilesAdd: (files: File[]) => void;
  onQuoteFileRemove: (key: string) => void;
};

type StepFinalConfirmationsProps = {
  showCredentials?: boolean;
  credentialMode?: 'new' | 'existing';
  onCredentialModeChange?: (value: 'new' | 'existing') => void;
  email?: string;
  username?: string;
  password?: string;
  passwordConfirm?: string;
  existingIdentifier?: string;
  existingPassword?: string;
  onEmailChange?: (value: string) => void;
  onUsernameChange?: (value: string) => void;
  onPasswordChange?: (value: string) => void;
  onPasswordConfirmChange?: (value: string) => void;
  onExistingIdentifierChange?: (value: string) => void;
  onExistingPasswordChange?: (value: string) => void;
  acceptPrivacy: boolean;
  acceptTerms: boolean;
  consentStorage: boolean;
  onAcceptPrivacyChange: (value: boolean) => void;
  onAcceptTermsChange: (value: boolean) => void;
  onConsentStorageChange: (value: boolean) => void;
};

function quoteFileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

type ExpenseRow = {
  expense: string;
  price: string;
  vat: string;
};

function emptyExpenseRow(): ExpenseRow {
  return { expense: '', price: '', vat: '' };
}

function hasExpenseValue(row: ExpenseRow) {
  return Boolean(row.expense.trim() || row.price.trim() || row.vat.trim());
}

function parseQuotesTextToRows(raw: string): ExpenseRow[] {
  const normalized = raw.trim();
  if (!normalized) return [];

  const chunks = normalized
    .split('\n')
    .flatMap((line) => line.split(';'))
    .map((line) => line.trim())
    .filter(Boolean);

  if (!chunks.length) return [];

  const rows = chunks.map((chunk) => {
    const parts = chunk.split('|').map((part) => part.trim());
    if (parts.length >= 3) {
      const rawVat = parts.slice(2).join(' | ').replace(/^iva:\s*/i, '').trim();
      const normalizedVat = /^(n\/?d|nd|-)$/i.test(rawVat) ? '' : rawVat;
      return {
        expense: parts[0].replace(/^spesa:\s*/i, '').trim(),
        price: parts[1].replace(/^prezzo:\s*/i, '').trim(),
        vat: normalizedVat
      };
    }
    return {
      expense: chunk.replace(/^spesa:\s*/i, '').trim(),
      price: '',
      vat: ''
    };
  });

  return rows.filter(hasExpenseValue);
}

function serializeExpenseRows(rows: ExpenseRow[]): string {
  const normalizedRows = rows
    .map((row) => ({
      expense: row.expense.trim(),
      price: row.price.trim(),
      vat: row.vat.trim()
    }))
    .filter((row) => row.expense || row.price || row.vat);

  return normalizedRows
    .map((row) => `Spesa: ${row.expense} | Prezzo: ${row.price} | IVA: ${row.vat}`)
    .join('\n');
}

function sameExpenseRows(a: ExpenseRow[], b: ExpenseRow[]) {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index].expense !== b[index].expense) return false;
    if (a[index].price !== b[index].price) return false;
    if (a[index].vat !== b[index].vat) return false;
  }
  return true;
}

function DocumentStatus({ file, uploaded = false }: { file: File | null; uploaded?: boolean }) {
  if (!file && !uploaded) {
    return (
      <span className="wizard7-docStatus is-missing">
        <AlertCircle size={13} />
        Mancante
      </span>
    );
  }

  return (
    <span className="wizard7-docStatus is-loaded">
      <CheckCircle2 size={13} />
      Caricato
    </span>
  );
}

export function StepPayment({
  clientSecret,
  sessionId,
  error,
  checking,
  loading,
  onEmbeddedPaymentComplete,
  onEmbeddedPaymentError,
  onVerify,
  onPayLater,
}: StepPaymentProps) {
  return (
    <section className="wizard7-pane wizard7-pane-payment">
      <div className="wizard7-paymentEmbedCard wizard7-paymentEmbedCard--integrated">
        <div className="wizard7-paymentCheckoutFrame">
          {clientSecret ? (
            <EmbeddedPracticeCheckout
              clientSecret={clientSecret}
              sessionId={sessionId}
              onComplete={onEmbeddedPaymentComplete}
              onError={onEmbeddedPaymentError}
            />
          ) : (
            <p className="wizard7-paymentLoadingText">
              <Loader2 size={16} className="animate-spin" />
              <span>Preparazione Stripe Payment Element…</span>
            </p>
          )}
        </div>

        <p className="wizard7-poweredByStripe">Powered by Stripe</p>

        <div className="wizard7-step1Actions">
          <button
            type="button"
            className="wizard7-btn wizard7-btn-muted"
            onClick={onVerify}
            disabled={checking || loading}
          >
            {checking ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Verifica...
              </>
            ) : (
              'Ho già pagato, verifica'
            )}
          </button>

          <button
            type="button"
            className="wizard7-btn wizard7-btn-ghost"
            onClick={onPayLater}
            disabled={loading || checking}
          >
            Pago dopo la verifica dei requisiti
          </button>
        </div>

        <p className="wizard7-payLaterNotice">
          Se paghi dopo la verifica, non salti la fila e i tempi di risposta saranno più lunghi.
        </p>

        {error ? <p className="wizard7-inlineError">{error}</p> : null}
      </div>
    </section>
  );
}

export function StepWelcome({ mode = 'legacy', showGuide, documentRequirements, onCloseGuide }: StepWelcomeProps) {
  const requiredDocs = documentRequirements.filter((requirement) => requirement.isRequired);

  if (mode === 'dashboard_client') {
    return (
      <section className="wizard7-pane wizard7-welcomeGuidePage">
        <h3 className="wizard7-sectionTitle">Come funziona l’onboarding</h3>
        <ol className="wizard7-welcomeGuideList">
          <li>Carichi i documenti richiesti per il bando selezionato.</li>
          <li>Il consulente BNDO verifica documenti e ammissibilità ufficiale della pratica.</li>
          <li>Riceverai in piattaforma il primo step di pagamento prima dell’invio pratica.</li>
          <li>Il secondo step di pagamento sarà quando il consulente invia la pratica.</li>
          <li>
            Il terzo step sarà a percentuale solo in caso di esito positivo del bando.
            L’esito finale dipende anche dall’ente valutatore e non può essere garantito da BNDO.
          </li>
        </ol>
        <p className="wizard7-payLaterNotice">
          Il costo della pratica ti verrà comunicato in piattaforma prima dell’avvio della pratica.
        </p>
        <p className="wizard7-payLaterNotice">
          Potrai caricare i documenti mancanti anche dopo, dalla dashboard della pratica.
        </p>
      </section>
    );
  }

  if (showGuide) {
    return (
      <section className="wizard7-pane wizard7-welcomeGuidePage">
        <h3 className="wizard7-sectionTitle">Come funziona l’onboarding</h3>
        <ol className="wizard7-welcomeGuideList">
          <li>Email e password di accesso dashboard</li>
          <li>PEC e disponibilità firma digitale</li>
          <li>
            Documenti obbligatori pratica:{' '}
            {requiredDocs.length > 0
              ? requiredDocs.map((requirement) => requirement.label).join(', ')
              : 'definiti dal bando selezionato'}
          </li>
          <li>Preventivi o alternativa testo bene/servizio + prezzo + IVA</li>
          <li>Consensi finali per attivazione pratica</li>
        </ol>
        <p className="wizard7-payLaterNotice">
          Potrebbero essere richiesti documenti integrativi: senza checklist completa il consulente BNDO non può
          avviare la pratica.
        </p>
        <button type="button" className="wizard7-btn wizard7-btn-muted" onClick={onCloseGuide}>
          Torna al benvenuto
        </button>
      </section>
    );
  }

  return (
    <section className="wizard7-pane wizard7-welcomePane">
      <div className="wizard7-welcomeCard wizard7-welcomeCardExpanded">
        <figure className="wizard7-welcomeDashboardFrame">
          <Image
            src="/dashboard-preview.png"
            alt="Anteprima dashboard BNDO"
            width={1600}
            height={980}
            className="wizard7-welcomeDashboardImage"
          />
        </figure>

        <ul className="wizard7-inlineBullets" aria-label="Funzionalità dashboard">
          <li>Visionare le tue pratiche</li>
          <li>Caricare documenti richiesti per il bando</li>
          <li>Chattare con il tuo consulente</li>
        </ul>
      </div>
    </section>
  );
}

export function StepAccountSetup({
  email,
  password,
  onEmailChange,
  onPasswordChange,
}: StepAccountSetupProps) {
  return (
    <section className="wizard7-pane">
      <div className="wizard7-formGrid">
        <label className="wizard7-field">
          <span>Email (login) *</span>
          <input
            className="wizard7-input"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="nome@email.it"
            inputMode="email"
            autoComplete="email"
          />
        </label>

        <label className="wizard7-field">
          <span>Password *</span>
          <input
            className="wizard7-input"
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder="Almeno 8 caratteri"
            autoComplete="new-password"
          />
        </label>
      </div>
    </section>
  );
}

export function StepPecFirma({
  pec,
  digitalSignature,
  onPecChange,
  onSignatureChange,
}: StepPecFirmaProps) {
  return (
    <section className="wizard7-pane">
      <div className="wizard7-formGrid">
        <label className="wizard7-field">
          <span>PEC *</span>
          <input
            className="wizard7-input"
            value={pec}
            onChange={(event) => onPecChange(event.target.value)}
            placeholder="nome@pec.it"
            inputMode="email"
          />
        </label>

        <label className="wizard7-field">
          <span>Firma digitale</span>
          <select
            className="wizard7-input"
            value={digitalSignature}
            onChange={(event) => onSignatureChange(event.target.value as 'yes' | 'no' | '')}
          >
            <option value="">Seleziona</option>
            <option value="no">Non in possesso</option>
            <option value="yes">In possesso</option>
          </select>
        </label>
      </div>
    </section>
  );
}

export function StepDocuments({
  mode = 'legacy',
  applicationId,
  pec,
  digitalSignature,
  onPecChange,
  onSignatureChange,
  requirements,
  requirementFiles,
  requirementFileErrors,
  removedUploadedKeys,
  onRequirementFileChange,
}: StepDocumentsProps) {
  return (
    <section className="wizard7-pane">
      <p className="wizard7-payLaterNotice" style={{ marginBottom: '0.9rem' }}>
        Carica i documenti obbligatori di questa pratica. Potrebbero essere richieste integrazioni aggiuntive:
        senza checklist completa il consulente non può avviare la pratica.
      </p>
      {mode === 'dashboard_client' ? (
        <>
          <div className="wizard7-formGrid" style={{ marginBottom: '1rem' }}>
            <label className="wizard7-field">
              <span>PEC *</span>
              <input
                className="wizard7-input"
                value={pec}
                onChange={(event) => onPecChange(event.target.value)}
                placeholder="nome@pec.it"
                inputMode="email"
              />
            </label>

            <label className="wizard7-field">
              <span>Firma digitale *</span>
              <select
                className="wizard7-input"
                value={digitalSignature}
                onChange={(event) => onSignatureChange(event.target.value as 'yes' | 'no' | '')}
              >
                <option value="">Seleziona</option>
                <option value="no">Non in possesso</option>
                <option value="yes">In possesso</option>
              </select>
            </label>
          </div>
          <p className="wizard7-payLaterNotice" style={{ marginBottom: '1rem' }}>
            Se manca qualche documento puoi completarlo anche dopo dalla dashboard:
            {' '}
            {applicationId ? (
              <Link href={`/dashboard/practices/${applicationId}?docs=missing`}>apri Documenti mancanti</Link>
            ) : (
              'sezione Documenti mancanti della pratica'
            )}
            .
          </p>
        </>
      ) : null}
      <div className="wizard7-docGrid">
        {requirements.length === 0 ? (
          <div className="wizard7-inlineError">
            Nessun documento obbligatorio configurato per questa pratica. Contatta supporto BNDO.
          </div>
        ) : null}
        {requirements.map((requirement) => {
          const file = requirementFiles[requirement.requirementKey] ?? null;
          const error = requirementFileErrors[requirement.requirementKey] ?? null;
          const isUploadedOnServer = requirement.status === 'uploaded';
          const isMarkedAsRemoved = removedUploadedKeys.has(requirement.requirementKey);
          const effectiveUploaded = (isUploadedOnServer && !isMarkedAsRemoved) || !!file;

          return (
            <div key={requirement.requirementKey} className="wizard7-docCardWrapper">
              <label className={`wizard7-docCard ${error ? 'is-invalid' : ''}`}>
                <span className="wizard7-docTitle">
                  {requirement.label}
                  {requirement.isRequired ? ' *' : ''}
                </span>
                <DocumentStatus file={file} uploaded={isUploadedOnServer && !isMarkedAsRemoved} />
                {requirement.description ? (
                  <span style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '0.3rem' }}>
                    {requirement.description}
                  </span>
                ) : null}
                <input
                  className="wizard7-file"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*"
                  onChange={(event) => onRequirementFileChange(requirement.requirementKey, event.target.files?.[0] ?? null)}
                />
                <span className="wizard7-fileLabel">
                  <UploadCloud size={14} />
                  {file?.name ?? (isUploadedOnServer && !isMarkedAsRemoved ? 'Documento già caricato' : 'Carica file')}
                </span>
                {effectiveUploaded ? (
                  <button
                    type="button"
                    className="wizard7-fileRemoveBtn"
                    title="Rimuovi o sostituisci file"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onRequirementFileChange(requirement.requirementKey, null);
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </label>
              {error ? <p className="wizard7-fieldError">{error}</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function StepPreventivi({
  quotesText,
  quotes,
  onQuotesTextChange,
  onQuoteFilesAdd,
  onQuoteFileRemove,
}: StepPreventiviProps) {
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>(() => parseQuotesTextToRows(quotesText));
  const [draftRow, setDraftRow] = useState<ExpenseRow>(emptyExpenseRow());

  useEffect(() => {
    const parsed = parseQuotesTextToRows(quotesText);
    setExpenseRows((previous) => (sameExpenseRows(previous, parsed) ? previous : parsed));
  }, [quotesText]);

  const applyExpenseRows = (nextRows: ExpenseRow[]) => {
    const normalizedRows = nextRows.filter(hasExpenseValue);
    setExpenseRows(normalizedRows);
    onQuotesTextChange(serializeExpenseRows(normalizedRows));
  };

  const updateDraftField = (field: keyof ExpenseRow, value: string) => {
    setDraftRow((previous) => ({ ...previous, [field]: value }));
  };

  const addDraftExpense = () => {
    const normalizedDraft: ExpenseRow = {
      expense: draftRow.expense.trim(),
      price: draftRow.price.trim(),
      vat: draftRow.vat.trim()
    };
    if (!hasExpenseValue(normalizedDraft)) return;
    applyExpenseRows([...expenseRows, normalizedDraft]);
    setDraftRow(emptyExpenseRow());
  };

  const removeRow = (index: number) => {
    const nextRows = expenseRows.filter((_, rowIndex) => rowIndex !== index);
    applyExpenseRows(nextRows);
  };

  return (
    <section className="wizard7-pane">
      <div className="wizard7-formGrid">
        <label className="wizard7-field">
          <span>Preventivi/Spese da sostenere</span>
          <input
            className="wizard7-input"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*,.zip"
            multiple
            onChange={(event) => {
              const incoming = Array.from(event.target.files ?? []);
              if (!incoming.length) return;
              onQuoteFilesAdd(incoming);
              event.currentTarget.value = '';
            }}
          />
        </label>

        <div className="wizard7-field">
          <div className="wizard7-expenseHeader">
            <span>Inserisci i preventivi/spese che vorresti sostenere</span>
          </div>

          <div className="wizard7-expenseRows">
            <div className="wizard7-expenseRow">
              <input
                className="wizard7-input"
                value={draftRow.expense}
                onChange={(event) => updateDraftField('expense', event.target.value)}
                placeholder="Spesa"
              />
              <input
                className="wizard7-input"
                value={draftRow.price}
                onChange={(event) => updateDraftField('price', event.target.value)}
                placeholder="Prezzo"
                inputMode="decimal"
              />
              <input
                className="wizard7-input"
                value={draftRow.vat}
                onChange={(event) => updateDraftField('vat', event.target.value)}
                placeholder="IVA (se applicabile)"
              />
              <button
                type="button"
                className="wizard7-expenseRowAddBtn"
                aria-label="Aggiungi spesa"
                onClick={addDraftExpense}
              >
                +
              </button>
            </div>
          </div>

          {expenseRows.length ? (
            <ul className="quote-files-grid" style={{ marginTop: 10 }}>
              {expenseRows.map((row, index) => (
                <li
                  key={`expense-chip-${index}-${row.expense}-${row.price}-${row.vat}`}
                  className="quote-file-chip"
                >
                  <span
                    className="quote-file-chipName"
                    title={`Spesa: ${row.expense || '-'} | Prezzo: ${row.price || '-'} | IVA: ${row.vat || '-'}`}
                  >
                    {`${row.expense || 'Spesa'} · ${row.price || 'Prezzo'}${row.vat ? ` · IVA ${row.vat}` : ''}`}
                  </span>
                  <button
                    type="button"
                    className="quote-file-chipRemove"
                    aria-label={`Rimuovi spesa ${row.expense || index + 1}`}
                    onClick={() => removeRow(index)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {quotes.length ? (
          <ul className="quote-files-grid">
            {quotes.map((file) => {
              const key = quoteFileKey(file);
              return (
                <li key={key} className="quote-file-chip">
                  <span className="quote-file-chipName" title={file.name}>
                    {file.name}
                  </span>
                  <button
                    type="button"
                    className="quote-file-chipRemove"
                    aria-label={`Rimuovi ${file.name}`}
                    onClick={() => onQuoteFileRemove(key)}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

export function StepFinalConfirmations({
  showCredentials = false,
  credentialMode = 'new',
  onCredentialModeChange,
  email = '',
  username = '',
  password = '',
  passwordConfirm = '',
  existingIdentifier = '',
  existingPassword = '',
  onEmailChange,
  onUsernameChange,
  onPasswordChange,
  onPasswordConfirmChange,
  onExistingIdentifierChange,
  onExistingPasswordChange,
  acceptPrivacy,
  acceptTerms,
  consentStorage,
  onAcceptPrivacyChange,
  onAcceptTermsChange,
  onConsentStorageChange,
}: StepFinalConfirmationsProps) {
  return (
    <section className="wizard7-pane">
      {showCredentials ? (
        <div className="wizard7-credentialsCard">
          <p className="wizard7-resumeTitle wizard7-credentialsTitle">Accesso dashboard</p>
          <div className="wizard7-credentialModeSwitch" role="tablist" aria-label="Modalità accesso">
            <button
              type="button"
              className={`wizard7-credentialModeBtn ${credentialMode === 'new' ? 'is-active' : ''}`}
              onClick={() => onCredentialModeChange?.('new')}
            >
              Nuovo utente
            </button>
            <button
              type="button"
              className={`wizard7-credentialModeBtn ${credentialMode === 'existing' ? 'is-active' : ''}`}
              onClick={() => onCredentialModeChange?.('existing')}
            >
              Utente già registrato
            </button>
          </div>

          {credentialMode === 'new' ? (
            <div className="wizard7-formGrid">
              <label className="wizard7-field">
                <span>Email accesso *</span>
                <input
                  className="wizard7-input"
                  value={email}
                  onChange={(event) => onEmailChange?.(event.target.value)}
                  placeholder="nome@email.it"
                  inputMode="email"
                  autoComplete="email"
                />
              </label>

              <label className="wizard7-field">
                <span>Password *</span>
                <input
                  className="wizard7-input"
                  type="password"
                  value={password}
                  onChange={(event) => onPasswordChange?.(event.target.value)}
                  placeholder="Almeno 8 caratteri"
                  autoComplete="new-password"
                />
              </label>

              <label className="wizard7-field">
                <span>Conferma password *</span>
                <input
                  className="wizard7-input"
                  type="password"
                  value={passwordConfirm}
                  onChange={(event) => onPasswordConfirmChange?.(event.target.value)}
                  placeholder="Ripeti la password"
                  autoComplete="new-password"
                />
              </label>
            </div>
          ) : (
            <div className="wizard7-formGrid">
              <label className="wizard7-field">
                <span>Email (o username) *</span>
                <input
                  className="wizard7-input"
                  value={existingIdentifier}
                  onChange={(event) => onExistingIdentifierChange?.(event.target.value)}
                  placeholder="Inserisci la tua email"
                  autoComplete="username"
                />
              </label>
              <label className="wizard7-field">
                <span>Password *</span>
                <input
                  className="wizard7-input"
                  type="password"
                  value={existingPassword}
                  onChange={(event) => onExistingPasswordChange?.(event.target.value)}
                  placeholder="Inserisci la password"
                  autoComplete="current-password"
                />
              </label>
            </div>
          )}
        </div>
      ) : null}

      <div className="wizard7-consentCard">
        <label className="wizard7-consentRow">
          <input type="checkbox" checked={acceptPrivacy} onChange={(event) => onAcceptPrivacyChange(event.target.checked)} />
          <span>
            Accetto la <Link href="/privacy">Privacy Policy</Link> *
          </span>
        </label>

        <label className="wizard7-consentRow">
          <input type="checkbox" checked={acceptTerms} onChange={(event) => onAcceptTermsChange(event.target.checked)} />
          <span>
            Accetto i <Link href="/termini">Termini e Condizioni</Link> *
          </span>
        </label>

        <label className="wizard7-consentRow">
          <input
            type="checkbox"
            checked={consentStorage}
            onChange={(event) => onConsentStorageChange(event.target.checked)}
          />
          <span>Autorizzo la conservazione dei dati e documenti ai fini della pratica *</span>
        </label>
      </div>
    </section>
  );
}
