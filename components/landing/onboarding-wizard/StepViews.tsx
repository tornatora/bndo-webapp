'use client';

import Image from 'next/image';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Loader2, UploadCloud } from 'lucide-react';
import { EmbeddedPracticeCheckout } from '@/components/landing/onboarding-wizard/EmbeddedPracticeCheckout';

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
  showGuide: boolean;
  didRequired?: boolean;
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
  digitalSignature: 'yes' | 'no';
  onPecChange: (value: string) => void;
  onSignatureChange: (value: 'yes' | 'no') => void;
};

type StepDocumentsProps = {
  idDocument: File | null;
  taxCodeDocument: File | null;
  didDocument: File | null;
  didRequired: boolean;
  onIdDocumentChange: (file: File | null) => void;
  onTaxCodeDocumentChange: (file: File | null) => void;
  onDidDocumentChange: (file: File | null) => void;
};



type StepPreventiviProps = {
  quotesText: string;
  quotes: File[];
  onQuotesTextChange: (value: string) => void;
  onQuoteFilesAdd: (files: File[]) => void;
  onQuoteFileRemove: (key: string) => void;
};

type StepFinalConfirmationsProps = {
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

function DocumentStatus({ file }: { file: File | null }) {
  if (!file) {
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

export function StepWelcome({ showGuide, didRequired, onCloseGuide }: StepWelcomeProps) {

  if (showGuide) {
    return (
      <section className="wizard7-pane wizard7-welcomeGuidePage">
        <h3 className="wizard7-sectionTitle">Come funziona l’onboarding</h3>
        <ol className="wizard7-welcomeGuideList">
          <li>Email e password di accesso dashboard</li>
          <li>PEC e disponibilità firma digitale</li>
          <li>Documento di identità e codice fiscale</li>
          {didRequired ? <li>Certificazione DID</li> : null}
          <li>Preventivi o alternativa testo bene/servizio + prezzo + IVA</li>

          <li>Consensi finali per attivazione pratica</li>

        </ol>
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
            onChange={(event) => onSignatureChange(event.target.value as 'yes' | 'no')}
          >
            <option value="no">Non in possesso</option>
            <option value="yes">In possesso</option>
          </select>
        </label>
      </div>
    </section>
  );
}

export function StepDocuments({
  idDocument,
  taxCodeDocument,
  didDocument,
  didRequired,
  onIdDocumentChange,
  onTaxCodeDocumentChange,
  onDidDocumentChange,
}: StepDocumentsProps) {


  return (
    <section className="wizard7-pane">
      <div className="wizard7-docGrid">
        <label className="wizard7-docCard">
          <span className="wizard7-docTitle">Documento di identità *</span>
          <DocumentStatus file={idDocument} />
          <input
            className="wizard7-file"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*"
            onChange={(event) => onIdDocumentChange(event.target.files?.[0] ?? null)}
          />
          <span className="wizard7-fileLabel">
            <UploadCloud size={14} />
            {idDocument?.name ?? 'Carica file'}
          </span>
        </label>

        <label className="wizard7-docCard">
          <span className="wizard7-docTitle">Codice fiscale *</span>
          <DocumentStatus file={taxCodeDocument} />
          <input
            className="wizard7-file"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*"
            onChange={(event) => onTaxCodeDocumentChange(event.target.files?.[0] ?? null)}
          />
          <span className="wizard7-fileLabel">
            <UploadCloud size={14} />
            {taxCodeDocument?.name ?? 'Carica file'}
          </span>
        </label>

        {didRequired ? (
          <label className="wizard7-docCard wizard7-docCard-full">
            <span className="wizard7-docTitle">Certificazione DID *</span>
            <DocumentStatus file={didDocument} />
            <input
              className="wizard7-file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*"
              onChange={(event) => onDidDocumentChange(event.target.files?.[0] ?? null)}
            />
            <span className="wizard7-fileLabel">
              <UploadCloud size={14} />
              {didDocument?.name ?? 'Carica file'}
            </span>
          </label>
        ) : null}
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
  return (
    <section className="wizard7-pane">
      <div className="wizard7-formGrid">
        <label className="wizard7-field">
          <span>Preventivi</span>
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

        <label className="wizard7-field">
          <span>Se non hai ancora il preventivo indica nome del prodotto/servizio + prezzo + IVA.</span>
          <textarea
            className="wizard7-input wizard7-input-area"
            value={quotesText}
            onChange={(event) => onQuotesTextChange(event.target.value)}
            placeholder="Es. Attrezzature 4.500€ + IVA; Software 1.200€ + IVA"
          />
        </label>

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
  acceptPrivacy,
  acceptTerms,
  consentStorage,
  onAcceptPrivacyChange,
  onAcceptTermsChange,
  onConsentStorageChange,
}: StepFinalConfirmationsProps) {
  return (
    <section className="wizard7-pane">
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
