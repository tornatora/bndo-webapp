import { LegalShell } from '@/components/legal/LegalShell';
import { LEGAL_ENTITY, LEGAL_LAST_UPDATED } from '@/lib/legal';

export const dynamic = 'force-static';

export default function TermsPage() {
  return (
    <LegalShell title="Termini e Condizioni" subtitle="Condizioni di utilizzo del sito e della piattaforma." updatedAtLabel={`Ultimo aggiornamento: ${LEGAL_LAST_UPDATED}`}>
      <p>
        I presenti Termini disciplinano l&apos;uso del sito e della piattaforma {LEGAL_ENTITY.brand}. Accedendo o utilizzando i
        servizi, l&apos;utente dichiara di aver letto e accettato i Termini.
      </p>

      <h2>1. Servizio</h2>
      <p>
        {LEGAL_ENTITY.brand} fornisce strumenti digitali e assistenza operativa per la gestione di pratiche legate a bandi di
        finanza agevolata, inclusi: raccolta informazioni, caricamento documenti, comunicazioni via chat, aggiornamento stato
        pratica e gestione pagamenti del servizio.
      </p>

      <h2>2. Account e Credenziali</h2>
      <ul>
        <li>Le credenziali possono essere generate automaticamente a seguito dell&apos;onboarding post-pagamento.</li>
        <li>L&apos;utente e responsabile della riservatezza delle credenziali e delle attivita svolte con il proprio account.</li>
      </ul>

      <h2>3. Documenti e Contenuti</h2>
      <ul>
        <li>L&apos;utente garantisce che i documenti caricati sono veritieri, pertinenti e di sua disponibilita.</li>
        <li>
          {LEGAL_ENTITY.brand} puo richiedere integrazioni documentali e rifiutare contenuti non conformi o illeciti.
        </li>
      </ul>

      <h2>4. Pagamenti</h2>
      <p>
        I pagamenti possono essere gestiti tramite provider terzi (es. Stripe). L&apos;eventuale avanzamento pagamenti per singola
        pratica puo essere tracciato in piattaforma. Eventuali rimborsi o condizioni economiche specifiche devono essere definite
        nel preventivo/accordo commerciale.
      </p>

      <h2>5. Limitazione di Responsabilita</h2>
      <p>
        {LEGAL_ENTITY.brand} si impegna a fornire il servizio con diligenza professionale. Tuttavia, l&apos;esito di una domanda di
        bando dipende anche da fattori esterni (es. requisiti, valutazioni dell&apos;ente, tempistiche, documentazione fornita
        dall&apos;utente). Nei limiti consentiti dalla legge, {LEGAL_ENTITY.brand} non garantisce l&apos;ottenimento di contributi.
      </p>

      <h2>6. Proprietà Intellettuale</h2>
      <p>Il sito, la piattaforma e i relativi contenuti sono protetti da diritti di proprieta intellettuale.</p>

      <h2>7. Privacy</h2>
      <p>Il trattamento dei dati personali e descritto nella Privacy Policy e nella Cookie Policy.</p>

      <h2>8. Contatti</h2>
      <p>
        Per richieste: <strong>{LEGAL_ENTITY.privacyEmail}</strong> (privacy) o supporto via WhatsApp: <strong>{LEGAL_ENTITY.supportWhatsapp}</strong>.
      </p>

      <p className="legal-note">
        Nota: questi Termini sono una base operativa. Prima del go-live vanno adattati al tuo modello contrattuale e revisionati
        con un consulente legale.
      </p>
    </LegalShell>
  );
}

