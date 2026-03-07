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
    return attempt >= 2
      ? pickOne(turnSeed, [
          'Mi basta una parola: PMI, startup, professionista, ETS o da costituire?',
          "Dimmi solo se l'attività esiste già o è da costituire."
        ])
      : pickOne(turnSeed, [
          "Hai già un'attività o devi costituirla?"
        ]);
  }

  if (step === 'sector') {
    return attempt >= 2
      ? pickOne(turnSeed, [
          'Che settore? (es. turismo, commercio, manifattura, ICT)',
          'Mi indichi il settore principale in cui operi?'
        ])
      : pickOne(turnSeed, ['In che settore operi? (es. turismo, commercio, manifattura, ICT)']);
  }

  if (step === 'ateco') {
    return attempt >= 2
      ? pickOne(turnSeed, [
          "Hai l'ATECO? Anche 2 cifre bastano. Se non lo sai, descrivi l'attività.",
          "Se ce l'hai, condividi il codice ATECO; altrimenti dimmi cosa fai."
        ])
      : pickOne(turnSeed, [
          "Mi dai il codice ATECO? Anche le prime 2 cifre bastano."
        ]);
  }

  if (step === 'location') {
    return attempt >= 2
      ? pickOne(turnSeed, [
          'Mi dici la regione in cui operi?',
          'Per filtrare bene i bandi, mi confermi la regione?'
        ])
      : pickOne(turnSeed, ['In che regione operi?']);
  }

  if (step === 'employees') {
    return attempt >= 2
      ? pickOne(turnSeed, ['Quanti dipendenti/addetti circa? (numero)', 'Mi dai un numero indicativo di addetti?'])
      : pickOne(turnSeed, ['Indicativamente, quanti dipendenti/addetti avete?']);
  }

  if (step === 'fundingGoal') {
    return attempt >= 2
      ? pickOne(turnSeed, [
          'Dimmi in una riga cosa vuoi finanziare (es. sito, macchinari, software, ristrutturazione, assunzioni).',
          'Qual e la spesa principale che vuoi coprire con il bando?'
        ])
      : pickOne(turnSeed, [
          'Cosa vuoi finanziare in concreto?'
        ]);
  }

  if (step === 'budget') {
    return attempt >= 2
      ? pickOne(turnSeed, [
          'Che importo vuoi investire e quale contributo vorresti ottenere? Anche stima.',
          "Mi dai due numeri indicativi: investimento totale e contributo richiesto?"
        ])
      : pickOne(turnSeed, ['Che importo vuoi investire e quanto contributo ti serve?']);
  }

  if (step === 'contributionPreference') {
    return attempt >= 2
      ? pickOne(turnSeed, [
          "Hai una preferenza sul tipo di aiuto? Fondo perduto, agevolato, voucher, credito d'imposta o misto?",
          "Ti interessa una forma specifica di incentivo o va bene anche una combinazione mista?"
        ])
      : pickOne(turnSeed, [
          "Preferisci fondo perduto, agevolato, voucher, credito d'imposta o misto?"
        ]);
  }

  if (step === 'contactEmail') {
    return attempt >= 2
      ? pickOne(turnSeed, ['Mi condividi una mail valida per il consulente?', 'Mi lasci una mail dove possiamo inviarti il riepilogo?'])
      : pickOne(turnSeed, ['Perfetto. Mi lasci una mail valida a cui il consulente puo scriverti?']);
  }

  if (step === 'contactPhone') {
    return attempt >= 2
      ? pickOne(turnSeed, [
          'Mi serve anche il numero di telefono per il ricontatto.',
          'Per chiudere il passaggio al consulente, mi dai il numero di telefono?'
        ])
      : pickOne(turnSeed, ['Ultimo passaggio: mi indichi il numero di telefono su cui vuoi essere ricontattato?']);
  }

  return 'Ho gli elementi necessari. Procedo subito a individuare le opportunità migliori per te.';
}

export function naturalBridgeQuestion(step: Step, attempt: number) {
  if (attempt > 2) return null;
  if (step === 'fundingGoal') return 'Partiamo da qui: cosa vuoi finanziare in concreto?';
  if (step === 'activityType') return "Dimmi se hai già un'attività o devi costituirla.";
  if (step === 'location') return 'Indicami la regione e filtro solo bandi pertinenti.';
  if (step === 'budget') return "Con un importo indicativo restringo subito il match.";
  if (step === 'contributionPreference') return "Preferisci fondo perduto, agevolato, voucher o credito d'imposta?";
  if (step === 'ateco') return "Se hai il codice ATECO (anche 2 cifre), miglioro subito la precisione.";
  if (step === 'sector') return 'Indicami anche il settore principale.';
  if (step === 'contactEmail') return 'Per passarti al consulente umano mi serve una mail valida.';
  if (step === 'contactPhone') return 'Ultimo dato: il numero per il ricontatto.';
  return null;
}
