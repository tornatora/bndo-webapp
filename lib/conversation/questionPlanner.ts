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
          'Mi basta una parola: PMI, startup, professionista, ETS oppure da costituire?',
          "Per inquadrarti bene, dimmi solo se l'attivita esiste gia o se e da costituire."
        ])
      : pickOne(turnSeed, [
          "Per capire bene l'ammissibilita: hai gia un'attivita (PMI/startup/professionista/ETS) o devi ancora costituirla?"
        ]);
  }

  if (step === 'sector') {
    return attempt >= 2
      ? pickOne(turnSeed, [
          'Che settore? (es. turismo, commercio, manifattura, ICT)',
          'Mi indichi il settore principale in cui operi?'
        ])
      : pickOne(turnSeed, ['Ok. In che settore operi? (es. turismo, commercio, manifattura, ICT)']);
  }

  if (step === 'ateco') {
    return attempt >= 2
      ? pickOne(turnSeed, [
          "Hai l'ATECO? Anche solo 2 cifre vanno bene. Se non lo sai, descrivimi l'attivita.",
          "Se ce l'hai, condividi il codice ATECO. In alternativa basta una riga su cosa fai."
        ])
      : pickOne(turnSeed, [
          "Per rendere il match piu preciso: mi dai il codice ATECO? Anche solo le prime 2 cifre. Se non lo sai, dimmi in una riga cosa fai."
        ]);
  }

  if (step === 'location') {
    return attempt >= 2
      ? pickOne(turnSeed, [
          'Mi dici la regione in cui operi?',
          'Per filtrare bene i bandi, mi confermi la regione?'
        ])
      : pickOne(turnSeed, ['Perfetto. In che regione operi? Se vuoi aggiungi anche il comune.']);
  }

  if (step === 'employees') {
    return attempt >= 2
      ? pickOne(turnSeed, ['Quanti dipendenti/addetti circa? (numero)', 'Mi dai un numero indicativo di addetti?'])
      : pickOne(turnSeed, ['Indicativamente, quanti dipendenti/addetti avete?']);
  }

  if (step === 'fundingGoal') {
    return attempt >= 2
      ? pickOne(turnSeed, [
          'Dimmi in una riga cosa vuoi finanziare. Esempio: sito web, macchinari, software, ristrutturazione, assunzioni.',
          'Qual e la spesa principale che vuoi coprire con il bando?'
        ])
      : pickOne(turnSeed, [
          'Raccontami in concreto cosa vuoi finanziare. Esempio: e-commerce, macchinari, software, ristrutturazione o assunzioni.'
        ]);
  }

  if (step === 'budget') {
    return attempt >= 2
      ? pickOne(turnSeed, [
          'Che importo vuoi investire e quale contributo vorresti ottenere? Anche una stima va bene.',
          "Mi dai due numeri indicativi: investimento totale e contributo che vorresti ottenere?"
        ])
      : pickOne(turnSeed, ['Per darti un match serio, che importo vuoi investire e quanto contributo vorresti ottenere? Anche a spanne.']);
  }

  if (step === 'contributionPreference') {
    return attempt >= 2
      ? pickOne(turnSeed, [
          "Hai una preferenza sul tipo di aiuto? Fondo perduto, agevolato, voucher, credito d'imposta o misto?",
          "Ti interessa una forma specifica di incentivo o va bene anche una combinazione mista?"
        ])
      : pickOne(turnSeed, [
          "Hai preferenze sulla forma di contributo? Fondo perduto, finanziamento agevolato, voucher, credito d'imposta o misto."
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

  return 'Ok, avvio lo scanner dei bandi compatibili…';
}

export function naturalBridgeQuestion(step: Step, attempt: number) {
  if (attempt > 2) return null;
  if (step === 'fundingGoal') return 'Se vuoi, partiamo da qui: cosa vorresti finanziare in concreto?';
  if (step === 'activityType') return "Quando vuoi, dimmi se hai gia un'attivita o se devi ancora costituirla.";
  if (step === 'location') return 'Appena vuoi, indicami la regione in cui opererai e filtro solo bandi pertinenti.';
  if (step === 'budget') return "Se hai gia un ordine di grandezza dell'investimento, posso restringere molto il match.";
  if (step === 'contributionPreference') return "Hai gia una preferenza tra fondo perduto, agevolato, voucher o credito d'imposta?";
  if (step === 'ateco') return "Se hai il codice ATECO, anche solo a 2 cifre, lo usiamo per rendere il match ancora piu preciso.";
  if (step === 'sector') return 'Se vuoi, indicami anche il settore: migliora subito la pertinenza dei risultati.';
  if (step === 'contactEmail') return 'Per passarti al consulente umano mi serve anche una mail valida.';
  if (step === 'contactPhone') return 'Ultimo dato: il numero a cui il consulente puo chiamarti.';
  return null;
}
