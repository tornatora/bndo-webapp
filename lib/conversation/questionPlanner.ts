import type { NextBestField, Step, UserProfile } from '@/lib/conversation/types';

function pickOne(seed: string, variants: string[]) {
  const n = [...seed].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return variants[n % variants.length] ?? variants[0]!;
}

export function nextBestFieldFromStep(step: Step): NextBestField | null {
  if (step === 'ready' || step === 'preScanConfirm') return null;
  return step;
}

export function questionForFounderEligibility(seed: string, attempt: number): string {
  const turnSeed = `${seed}:${attempt}`;
  return pickOne(turnSeed, [
    "Per verificare l'ammissibilità: quanti anni hai e qual è la tua situazione occupazionale? (es. disoccupato, studente, occupato)",
    "Mi serve età e stato occupazionale per i bandi: sei under 35? Lavori già o sei disoccupato/inoccupato?",
    "Per filtrare i bandi adatti: hai meno di 35 anni? Qual è la tua situazione lavorativa attuale?",
  ]);
}

/** La domanda pre-scan di conferma: posta una sola volta appena il profilo è pre_scan_ready */
export function questionForPreScanConfirm(): string {
  return "Prima di avviare la ricerca: c'è altro che vuoi specificare o chiarire? (es. budget, forma di contributo preferita, dimensione azienda) Altrimenti procedo subito.";
}

export function questionFor(step: Step, seed: string, attempt: number) {
  const turnSeed = `${seed}:${attempt}`;
  if (step === 'activityType') {
    return pickOne(turnSeed, [
      "L'attività è già operativa o devi ancora costituirla?",
      "L'azienda è già attiva o si tratta di un'idea da avviare?",
      "Siete già operativi con partita IVA o state aprendo ora?"
    ]);
  }

  if (step === 'sector') {
    return pickOne(turnSeed, [
      "In quale settore operi principalmente? (es. manifattura, agricoltura, servizi, ICT, commercio)",
      "Qual è il settore di attività dell'impresa? Una parola basta.",
      "Di cosa si occupa nello specifico la tua attività?"
    ]);
  }

  if (step === 'ateco') {
    return pickOne(turnSeed, [
      "Se conosci il codice ATECO indicamelo, altrimenti descrivimi bene cosa fai.",
      "Qual è il codice ATECO dell'azienda? (Bastano anche le prime 2 cifre)",
      "Puoi dirmi il codice ATECO o confermare l'attività specifica?"
    ]);
  }

  if (step === 'location') {
    return pickOne(turnSeed, [
      "In quale regione ha sede il progetto?",
      "Dove si trova l'unità locale da finanziare?",
      "In quale regione svilupperai l'investimento?"
    ]);
  }

  if (step === 'employees') {
    return pickOne(turnSeed, [
      "Quanti dipendenti o addetti ha l'azienda?",
      "Qual è la dimensione attuale del team?",
      "Quante persone lavorano in azienda?"
    ]);
  }

  if (step === 'fundingGoal') {
    return pickOne(turnSeed, [
      "Cosa vuoi finanziare in concreto? (es. macchinari, software, sede, assunzioni)",
      "Qual è l'obiettivo principale dell'investimento? Cosa acquisti o realizzi?",
      "Su cosa si concentra il progetto che vuoi agevolare?"
    ]);
  }

  if (step === 'budget') {
    return pickOne(turnSeed, [
      "A quanto ammonta indicativamente l'investimento totale? (ordine di grandezza va benissimo)",
      "Che budget hai ipotizzato per questo progetto?",
      "Qual è l'entità della spesa complessiva che prevedi?"
    ]);
  }

  if (step === 'contributionPreference') {
    return pickOne(turnSeed, [
      "Cerchi fondo perduto, finanziamento agevolato o ti interessano entrambi?",
      "Quale forma di agevolazione preferisci: fondo perduto, finanziamento a tasso agevolato, o valuti tutto?",
      "Ti interessa soprattutto il fondo perduto o anche il credito d'imposta o finanziamenti?"
    ]);
  }

  if (step === 'preScanConfirm') {
    return questionForPreScanConfirm();
  }

  if (step === 'contactEmail') {
    return "A quale mail posso inviarti il riepilogo dei bandi?";
  }

  if (step === 'contactPhone') {
    return "A quale numero può chiamarti il consulente per un approfondimento?";
  }

  // step === 'ready' → mai deve arrivare qui come testo mostrato all'utente
  // il frontend gestisce autonomamente l'avvio dello scanner
  return '';
}

export function naturalBridgeQuestion(step: Step, attempt: number) {
  if (attempt > 2) return null;
  if (step === 'fundingGoal') return 'Per iniziare, dimmi cosa vuoi finanziare.';
  if (step === 'activityType') return "Un dettaglio: l'impresa esiste già?";
  if (step === 'location') return 'Per i filtri regionali, mi serve sapere dove operi.';
  if (step === 'budget') return 'Con un importo indicativo posso essere più preciso.';
  if (step === 'ateco') return 'Se hai il codice ATECO restringiamo subito il campo.';
  if (step === 'sector') return 'In quale settore di attività ti muovi?';
  if (step === 'contributionPreference') return 'Cerchi fondo perduto o vai bene anche con finanziamento agevolato?';
  if (step === 'preScanConfirm') return questionForPreScanConfirm();
  return null;
}
