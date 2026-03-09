import Link from 'next/link';
import { LegalShell } from '@/components/legal/LegalShell';
import { LEGAL_ENTITY, LEGAL_LAST_UPDATED } from '@/lib/legal';

export const dynamic = 'force-static';

export default function GdprPage() {
  return (
    <LegalShell title="GDPR" subtitle="I tuoi diritti e come esercitarli." updatedAtLabel={`Ultimo aggiornamento: ${LEGAL_LAST_UPDATED}`}>
      <p>
        Il Regolamento (UE) 2016/679 (“GDPR”) tutela i tuoi dati personali. Qui trovi un riepilogo dei diritti principali e del
        canale di contatto per esercitarli.
      </p>

      <h2>I tuoi diritti</h2>
      <ul>
        <li>
          <strong>Accesso:</strong> ottenere conferma e copia dei dati trattati.
        </li>
        <li>
          <strong>Rettifica:</strong> correggere dati inesatti o incompleti.
        </li>
        <li>
          <strong>Cancellazione:</strong> chiedere la rimozione nei casi previsti (“diritto all&apos;oblio”).
        </li>
        <li>
          <strong>Limitazione:</strong> limitare il trattamento in determinate circostanze.
        </li>
        <li>
          <strong>Portabilita:</strong> ricevere i dati in formato strutturato e trasferirli ad altro titolare.
        </li>
        <li>
          <strong>Opposizione:</strong> opporti al trattamento nei casi previsti.
        </li>
      </ul>

      <h2>Come esercitare i diritti</h2>
      <p>
        Scrivi a <strong>{LEGAL_ENTITY.privacyEmail}</strong> indicando l&apos;oggetto della richiesta e l&apos;email usata sulla
        piattaforma. Potremmo richiedere informazioni aggiuntive per verificare l&apos;identita.
      </p>

      <h2>Informativa completa</h2>
      <p>
        Per tutti i dettagli su dati, finalita, basi giuridiche e conservazione, leggi la{' '}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </LegalShell>
  );
}

