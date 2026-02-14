import { LegalShell } from '@/components/legal/LegalShell';
import { LEGAL_ENTITY, LEGAL_LAST_UPDATED } from '@/lib/legal';

export const dynamic = 'force-static';

export default function CookiePolicyPage() {
  return (
    <LegalShell title="Cookie Policy" subtitle="Informazioni sui cookie e sulle tecnologie simili." updatedAtLabel={`Ultimo aggiornamento: ${LEGAL_LAST_UPDATED}`}>
      <p>
        Questa pagina descrive l&apos;uso dei cookie sul sito {LEGAL_ENTITY.brand}. I cookie sono piccoli file di testo che i
        siti web salvano sul dispositivo dell&apos;utente per garantire il funzionamento, ricordare preferenze e, con consenso,
        migliorare l&apos;esperienza.
      </p>

      <h2>Cookie tecnici (necessari)</h2>
      <p>
        Usiamo cookie tecnici indispensabili per il corretto funzionamento del sito e della piattaforma (ad esempio autenticazione,
        sicurezza, gestione sessione). Questi cookie non richiedono consenso.
      </p>

      <h2>Cookie non essenziali</h2>
      <p>
        Eventuali cookie non essenziali (es. analytics) vengono attivati solo con il tuo consenso tramite il banner cookie. Se
        al momento non utilizziamo cookie analytics, il banner resta comunque disponibile per gestire eventuali integrazioni future
        in modo conforme.
      </p>

      <h2>Cookie di terze parti</h2>
      <p>
        Alcune funzionalita possono coinvolgere servizi di terze parti. Ad esempio, i pagamenti vengono gestiti tramite Stripe su
        domini Stripe, soggetti alle loro informative e cookie policy.
      </p>

      <h2>Come gestire i cookie</h2>
      <ul>
        <li>Puoi modificare le preferenze dal banner cookie (se disponibile).</li>
        <li>Puoi anche cancellare o bloccare i cookie dalle impostazioni del browser.</li>
      </ul>

      <h2>Contatti</h2>
      <p>
        Per domande su cookie e privacy puoi scriverci a <strong>{LEGAL_ENTITY.privacyEmail}</strong>.
      </p>

      <p className="legal-note">
        Nota: questo testo e una base operativa. Verifica l&apos;elenco cookie effettivamente usati in produzione (es. strumenti
        analytics) prima del go-live.
      </p>
    </LegalShell>
  );
}

