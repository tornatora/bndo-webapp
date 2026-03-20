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

  if (step === 'teamMajority') {
    return pickOne(turnSeed, [
      "Il team o l'assetto societario sarà a maggioranza giovanile (under 35) o femminile? (Ci sono bandi dedicati)",
      "Per sbloccare bandi specifici: l'impresa sarà a prevalenza femminile o under 35?",
      "La tua idea prevede una maggioranza di donne o under 35 nella compagine sociale?"
    ]);
  }

  if (step === 'agricultureStatus') {
    return pickOne(turnSeed, [
      "Trattandosi di agricoltura: hai già la disponibilità di terreni e il titolo di IAP (Imprenditore Agricolo Professionale)?",
      "Per i bandi agricoli (es. PSR/ISMEA): hai già accesso a terreni agricoli e possiedi la qualifica IAP?",
      "Operando nel primario, mi confermi se hai già terreni a disposizione e la qualifica IAP attiva?"
    ]);
  }

  if (step === 'tech40') {
    return pickOne(turnSeed, [
      "I beni strumentali o software che vuoi acquistare rientrano nei requisiti di Industria 4.0 (interconnessi) o Transizione 5.0 (risparmio energetico)?",
      "Per sbloccare i massimali più alti: gli investimenti previsti sono di tipo 4.0 o mirati all'efficienza energetica (5.0)?",
      "L'investimento in macchinari/software prevede tecnologie 4.0 o 5.0 green?"
    ]);
  }

  if (step === 'professionalRegister') {
    return pickOne(turnSeed, [
      "Come libero professionista, sei iscritto a un Ordine/Albo specifico o sei in gestione separata INPS?",
      "Per filtrare i bandi professionali: sei regolarmente iscritto al tuo Albo o Ordine di appartenenza?",
      "Sei già iscritto a un Ordine professionale per questo tipo di attività?"
    ]);
  }

  if (step === 'isThirdSector') {
    return pickOne(turnSeed, [
      "Trattandosi di un ente/associazione, siete iscritti al RUNTS (Registro Unico Nazionale Terzo Settore)?",
      "Per gli enti non profit: confermi l'iscrizione al RUNTS o siete una Cooperativa Sociale?",
      "Trattandosi di un ente del Terzo Settore, siete regolarmente iscritti al RUNTS?"
    ]);
  }

  if (step === 'propertyStatus') {
    return pickOne(turnSeed, [
      "Per finanziare lavori edili o immobili, hai già la proprietà dell'immobile o un contratto di affitto commerciale registrato?",
      "I lavori murari richiedono un titolo sull'immobile. Ne sei proprietario o hai un contratto di locazione in essere?",
      "Per agevolare ristrutturazioni o sedi, sei già in possesso dell'immobile (proprietà o affitto registrato)?"
    ]);
  }

  if (step === 'foundationYear') {
    return pickOne(turnSeed, [
      "In che anno è stata costituita l'impresa? (Serve per i bandi startup vs consolidati)",
      "Qual è l'anno di fondazione dell'attività? Aiuta a filtrare i bandi per anzianità.",
      "Mi servirebbe l'anno di apertura dell'azienda per verificare i requisiti temporali."
    ]);
  }

  if (step === 'legalForm') {
    return pickOne(turnSeed, [
      "Si tratta di una società (es. SRL), ditta individuale o sei un libero professionista?",
      "Qual è la forma giuridica dell'attività? (es. SRL, ditta individuale, professionista)",
      "Sei una società già costituita, una ditta individuale o lavori come professionista?"
    ]);
  }

  if (step === 'annualTurnover') {
    return pickOne(turnSeed, [
      "Qual è il fatturato annuo indicativo della tua azienda? (Serve per alcuni bandi dimensionali)",
      "A quanto ammontano i ricavi dell'ultimo esercizio? Aiuta a filtrare bandi per PMI consolidate.",
      "Mi servirebbe conoscere il volume d'affari annuo per verificare l'accesso a misure specifiche."
    ]);
  }

  if (step === 'isInnovative') {
    return pickOne(turnSeed, [
      "Siete iscritti al registro speciale delle Startup o PMI Innovative?",
      "L'azienda ha la qualifica di Startup Innovativa o PMI Innovativa?",
      "Confermi se siete iscritti nella sezione speciale del Registro Imprese per l'innovazione?"
    ]);
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
  if (step === 'legalForm') return 'Una precisazione: sei una ditta individuale, una società o un professionista?';
  
  if (step === 'teamMajority') return "Un dettaglio importante per i bandi: ci sarà maggioranza giovanile o femminile?";
  if (step === 'agricultureStatus') return "Sull'agricoltura: hai già terreni e qualifica IAP?";
  if (step === 'tech40') return "I macchinari o software saranno 4.0 o green?";
  if (step === 'professionalRegister') return "Come professionista, sei iscritto a un Ordine o Albo?";
  if (step === 'isThirdSector') return "Siete iscritti al RUNTS come ente del Terzo Settore?";
  if (step === 'propertyStatus') return "Per l'immobile: hai la proprietà o un contratto di affitto?";
  if (step === 'foundationYear') return "Un chiarimento sull'anzianità: in che anno è nata l'azienda?";
  if (step === 'annualTurnover') return "Per i filtri di fatturato: qual è il volume d'affari annuo?";
  if (step === 'isInnovative') return "Siete iscritti come Startup o PMI Innovativa?";
  
  if (step === 'preScanConfirm') return questionForPreScanConfirm();
  return null;
}
