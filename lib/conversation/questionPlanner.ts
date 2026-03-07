import type { NextBestField, Step, UserProfile } from '@/lib/conversation/types';

function pickOne(seed: string, variants: string[]) {
  const n = [...seed].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return variants[n % variants.length] ?? variants[0]!;
}

export function nextBestFieldFromStep(step: Step): NextBestField | null {
  return step === 'ready' ? null : step;
}

export function questionForFounderEligibility(seed: string, attempt: number): string {
  const turnSeed = `${seed}:${attempt}`;
  return pickOne(turnSeed, [
    "Per verificare l'ammissibilità: quanti anni hai e qual è la tua situazione occupazionale? (es. disoccupato, studente, occupato)",
    "Mi serve età e stato occupazionale per i bandi: sei under 35? Lavori già o sei disoccupato/inoccupato?",
    "Per filtrare i bandi adatti: hai meno di 35 anni? Qual è la tua situazione lavorativa attuale?",
  ]);
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
      "In quale settore operi principalmente?",
      "Qual è l'ambito di attività dell'impresa?",
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
      "Cosa vuoi finanziare in concreto? (es. macchinari, software, sede)",
      "Qual è l'obiettivo principale dell'investimento?",
      "Su cosa si concentra il progetto che vuoi agevolare?"
    ]);
  }

  if (step === 'budget') {
    return pickOne(turnSeed, [
      "A quanto ammonta indicativamente l'investimento totale?",
      "Che budget hai ipotizzato per questo progetto?",
      "Qual è la spesa complessiva che prevedi?"
    ]);
  }

  if (step === 'contributionPreference') {
    return pickOne(turnSeed, [
      "Cerchi fondo perduto, finanziamento agevolato o ti interessano entrambi?",
      "Valuti ogni forma di agevolazione o ne cerchi una specifica?",
      "Ti interessa soprattutto il fondo perduto o anche il credito d'imposta?"
    ]);
  }

  if (step === 'contactEmail') {
    return "A quale mail posso inviarti il riepilogo dei bandi?";
  }

  if (step === 'contactPhone') {
    return "A quale numero può chiamarti il consulente per un approfondimento?";
  }

  return 'Ho gli elementi necessari. Individuo subito le opportunità migliori per te.';
}

export function naturalBridgeQuestion(step: Step, attempt: number) {
  if (attempt > 2) return null;
  // Make bridges less robotic and more contextual
  if (step === 'fundingGoal') return 'Per iniziare, dimmi cosa vuoi finanziare.';
  if (step === 'activityType') return 'Un dettaglio: l\'impresa esiste già?';
  if (step === 'location') return 'Per i filtri regionali, mi serve sapere dove operi.';
  if (step === 'budget') return 'Con un importo indicativo posso essere più preciso.';
  if (step === 'ateco') return 'Se hai il codice ATECO restringiamo subito il campo.';
  if (step === 'sector') return 'In quale settore di attività ti muovi?';
  return null;
}
