import type { NextBestField, Step } from '@/lib/conversation/types';

function pickOne(seed: string, variants: string[]) {
  const n = [...seed].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return variants[n % variants.length] ?? variants[0]!;
}

export function nextBestFieldFromStep(step: Step): NextBestField | null {
  return step === 'ready' ? null : step;
}

export function questionFor(step: Step, seed: string, attempt: number) {
  const turnSeed = `${seed}:${attempt}`;
  if (step === 'activityType') {
    return pickOne(turnSeed, [
      "L'attività è già operativa o devi ancora costituirla?",
      "Hai già un'impresa attiva o si tratta di una nuova iniziativa?",
      "L'azienda è già registrata o sei in fase di apertura?"
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
      "Hai il codice ATECO o puoi descrivermi l'attività nel dettaglio?",
      "Qual è il codice ATECO dell'azienda? (Bastano anche le prime 2 cifre)",
      "Se conosci il codice ATECO indicamelo, altrimenti descrivimi bene cosa fai."
    ]);
  }

  if (step === 'location') {
    return pickOne(turnSeed, [
      "In che regione ha sede il progetto?",
      "Dove si trova l'unità locale da finanziare?",
      "In quale regione svilupperai l'investimento?"
    ]);
  }

  if (step === 'employees') {
    return pickOne(turnSeed, [
      "Quanti dipendenti o addetti ha l'azienda?",
      "Qual è la dimensione attuale del team?",
      "Quante persone lavorano in azienda (inclusi i soci)?"
    ]);
  }

  if (step === 'fundingGoal') {
    return pickOne(turnSeed, [
      "Cosa devi acquistare o realizzare in concreto?",
      "Qual è l'obiettivo principale dell'investimento?",
      "In cosa consiste il progetto che vuoi finanziare?"
    ]);
  }

  if (step === 'budget') {
    return pickOne(turnSeed, [
      "A quanto ammonta indicativamente l'investimento previsto?",
      "Che budget hai ipotizzato per questo progetto?",
      "Qual è la spesa complessiva che hai in mente?"
    ]);
  }

  if (step === 'contributionPreference') {
    return pickOne(turnSeed, [
      "Preferisci fondo perduto, finanziamento agevolato o ti interessano entrambi?",
      "Cerchi una forma di agevolazione specifica o valuti ogni opportunità?",
      "Punti al fondo perduto o valuti anche finanziamenti a tasso agevolato?"
    ]);
  }

  if (step === 'contactEmail') {
    return "Qual è la tua mail per ricevere il riepilogo e il contatto del consulente?";
  }

  if (step === 'contactPhone') {
    return "A quale numero di telefono preferisci essere ricontattato?";
  }

  return 'Ho gli elementi necessari. Procedo subito a individuare le opportunità migliori per te.';
}

export function naturalBridgeQuestion(step: Step, attempt: number) {
  if (attempt > 2) return null;
  if (step === 'fundingGoal') return 'Per iniziare, mi serve capire cosa vuoi finanziare.';
  if (step === 'activityType') return 'Un dettaglio importante: l\'azienda esiste già?';
  if (step === 'location') return 'Per filtrare i bandi territoriali mi serve la regione.';
  if (step === 'budget') return 'Con un importo indicativo posso essere molto più preciso.';
  if (step === 'ateco') return 'Se hai il codice ATECO riduciamo drasticamente il rumore.';
  if (step === 'sector') return 'Mi indichi il settore principale di riferimento?';
  return null;
}
