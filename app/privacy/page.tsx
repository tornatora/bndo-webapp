import { LegalShell } from '@/components/legal/LegalShell';
import { LEGAL_ENTITY, LEGAL_LAST_UPDATED } from '@/lib/legal';

export const dynamic = 'force-static';

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      subtitle="Informativa ai sensi del Regolamento (UE) 2016/679 (GDPR)."
      updatedAtLabel={`Ultimo aggiornamento: ${LEGAL_LAST_UPDATED}`}
    >
      <p>
        La presente informativa descrive le modalita con cui {LEGAL_ENTITY.companyName} (di seguito, “{LEGAL_ENTITY.brand}” o
        “Titolare”) tratta i dati personali raccolti tramite il sito e la piattaforma, inclusi quiz requisiti, onboarding,
        caricamento documenti e comunicazioni in chat.
      </p>

      <h2>Titolare del Trattamento</h2>
      <ul>
        <li>
          <strong>Ragione sociale:</strong> {LEGAL_ENTITY.companyName}
        </li>
        <li>
          <strong>Indirizzo:</strong> {LEGAL_ENTITY.address}
        </li>
        <li>
          <strong>P.IVA:</strong> {LEGAL_ENTITY.vatNumber}
        </li>
        <li>
          <strong>Contatto privacy:</strong> {LEGAL_ENTITY.privacyEmail}
        </li>
      </ul>

      <h2>Dati Trattati</h2>
      <p>Possiamo trattare, a titolo esemplificativo:</p>
      <ul>
        <li>Dati identificativi e di contatto (nome, cognome, email, telefono, PEC).</li>
        <li>Dati forniti nel quiz requisiti e nelle richieste di pratica.</li>
        <li>
          Documenti caricati (es. documento di identita, codice fiscale, certificazione DID, preventivi di spesa) e relativi
          metadati (nome file, data/ora, dimensione).
        </li>
        <li>Messaggi in chat e contenuti correlati alle richieste.</li>
        <li>Dati tecnici (log, indirizzo IP, identificativi di sessione/cookie tecnici necessari).</li>
      </ul>

      <h2>Finalita e Basi Giuridiche</h2>
      <ul>
        <li>
          <strong>Erogazione del servizio e gestione della pratica:</strong> raccolta informazioni, caricamento documenti,
          comunicazioni operative, aggiornamento avanzamento pratica (base giuridica: esecuzione di misure precontrattuali e/o
          del contratto).
        </li>
        <li>
          <strong>Gestione pagamenti e fatturazione:</strong> verifica pagamenti, contabilita e adempimenti (base giuridica:
          obbligo di legge e/o contratto).
        </li>
        <li>
          <strong>Assistenza e supporto:</strong> richieste via chat, email o canali di supporto (base giuridica: contratto e/o
          legittimo interesse).
        </li>
        <li>
          <strong>Sicurezza e prevenzione abusi:</strong> protezione della piattaforma, audit e log (base giuridica: legittimo
          interesse).
        </li>
      </ul>

      <h2>Conservazione</h2>
      <p>
        Conserviamo i dati per il tempo necessario al perseguimento delle finalita indicate e, ove applicabile, per i tempi
        previsti da obblighi di legge (es. amministrativi/contabili). I documenti caricati vengono conservati per la gestione
        della pratica e per eventuali esigenze di tutela e tracciabilita.
      </p>

      <h2>Destinatari e Responsabili del Trattamento</h2>
      <p>
        I dati possono essere trattati da fornitori che operano come responsabili (es. hosting, database, invio email, pagamenti)
        e da personale autorizzato. A titolo esemplificativo, la piattaforma puo utilizzare:
      </p>
      <ul>
        <li>Provider di hosting e infrastruttura (es. per l&apos;erogazione del sito/app).</li>
        <li>Provider di autenticazione, database e storage documenti.</li>
        <li>Provider pagamenti (Stripe) per la gestione del checkout.</li>
        <li>Provider email transazionali per invio credenziali e notifiche.</li>
      </ul>

      <h2>Trasferimenti Extra UE</h2>
      <p>
        Alcuni fornitori potrebbero trattare dati al di fuori dello Spazio Economico Europeo. In tal caso, il Titolare adotta
        misure adeguate (es. Clausole Contrattuali Standard) secondo la normativa applicabile.
      </p>

      <h2>Diritti dell&apos;Interessato</h2>
      <p>
        Hai diritto di chiedere accesso, rettifica, cancellazione, limitazione, portabilita, opposizione, nonche di proporre
        reclamo all&apos;Autorita Garante. Per esercitare i diritti: scrivi a <strong>{LEGAL_ENTITY.privacyEmail}</strong>.
      </p>

      <h2>Modifiche</h2>
      <p>La presente informativa puo essere aggiornata. La data di ultimo aggiornamento e indicata in alto.</p>

      <p className="legal-note">
        Nota: questo testo e una base operativa da finalizzare con i dati societari e revisionare con il tuo consulente legale
        prima del go-live.
      </p>
    </LegalShell>
  );
}

