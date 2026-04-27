import { normalizeForMatch } from '@/lib/text/normalize';

export type LimitedPiaMeasureId = 'resto-al-sud-20' | 'autoimpiego-centro-nord';

type AidBand = {
  maxProjectAmountEur: number;
  grantRatePct: number;
  label: string;
};

export type LimitedPiaMeasure = {
  id: LimitedPiaMeasureId;
  title: 'Resto al Sud 2.0' | 'Autoimpiego Centro Nord';
  territoryLabel: string;
  territories: string[];
  openingDateLabel: string;
  responseTimingLabel: string;
  timingNotes: string[];
  beneficiaries: string[];
  legalForms: string[];
  keyRequirements: string[];
  governanceRuleLabel: string;
  atecoLockRuleLabel: string;
  oneApplicationRuleLabel: string;
  exclusions: string[];
  aidHighlights: string[];
  voucherBaseMaxEur: number;
  voucherWithBonusMaxEur: number;
  investmentAidBands: AidBand[];
  projectTimelineLabel: string;
  salRuleLabel: string;
  deMinimisLabel: string;
  eligibleExpenses: string[];
  nonEligibleExpenses: string[];
  officialSources: string[];
  supportingSources?: string[];
};

const COMMON_BENEFICIARIES = [
  'persone fisiche tra 18 anni compiuti e 35 anni non compiuti',
  'inoccupati, inattivi o disoccupati (inclusi destinatari GOL)',
  'working poor secondo i criteri fiscali richiamati nelle FAQ Invitalia',
  'soggetti in condizioni di marginalità, vulnerabilità o discriminazione previste dalla normativa attuativa',
];

const COMMON_LEGAL_FORMS = [
  'lavoratore autonomo con partita IVA',
  'ditta individuale',
  'società di persone (SNC, SAS)',
  'società di capitali (SRL, SRLS) e cooperative',
  'attività libero-professionali, anche in forma di società tra professionisti',
];

const COMMON_KEY_REQUIREMENTS = [
  "iniziativa avviata nel mese di presentazione della domanda o nel mese precedente, purché risulti inattiva",
  'coerenza tra progetto, spese e territorio agevolato',
  'rispetto della regola ATECO (prime 3 cifre) nei 6 mesi precedenti',
  'nelle società: maggioranza quote e governance in capo ai soggetti con requisiti',
];

const COMMON_ELIGIBLE_EXPENSES = [
  'macchinari, impianti, attrezzature e arredi nuovi di fabbrica',
  'software, licenze, servizi ICT e cloud coerenti con il progetto',
  'consulenze tecnico-specialistiche capitalizzabili legate a innovazione, digitale o efficienza energetica',
  'marchi, brevetti, certificazioni tecniche/ambientali connesse al progetto',
];

const COMMON_NON_ELIGIBLE_EXPENSES = [
  'acquisto di terreni o immobili',
  'canoni di affitto, utenze, costi ricorrenti di gestione',
  'personale, compensi soci, materie prime e scorte',
  'consulenze per predisposizione domanda, consulenze legali/fiscali ordinarie',
  'beni usati o in leasing',
];

const COMMON_TIMING_NOTES = [
  'procedura a sportello: conta l’ordine cronologico di arrivo',
  'istruttoria entro 90 giorni dalla presentazione, salvo richieste di integrazione',
  'le domande proseguono fino a esaurimento della dotazione disponibile',
];

const RESTO_AL_SUD_20: LimitedPiaMeasure = {
  id: 'resto-al-sud-20',
  title: 'Resto al Sud 2.0',
  territoryLabel: 'Mezzogiorno + specifiche aree del Centro colpite da sisma (come da normativa attuativa)',
  territories: ['Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Molise', 'Puglia', 'Sardegna', 'Sicilia'],
  openingDateLabel: '15/10/2025 (procedura a sportello)',
  responseTimingLabel: 'Invitalia indica esame domanda entro 90 giorni dalla presentazione',
  timingNotes: [...COMMON_TIMING_NOTES],
  beneficiaries: [...COMMON_BENEFICIARIES],
  legalForms: [...COMMON_LEGAL_FORMS],
  keyRequirements: [...COMMON_KEY_REQUIREMENTS],
  governanceRuleLabel:
    'nelle società, i soggetti con requisiti devono detenere almeno il 50% + 1 euro delle quote e la maggioranza della governance',
  atecoLockRuleLabel:
    'il richiedente non deve essere stato socio/titolare, nei 6 mesi precedenti, di attività con ATECO coincidente nelle prime 3 cifre',
  oneApplicationRuleLabel: 'non è possibile avere più domande attive contemporaneamente per lo stesso soggetto',
  exclusions: ['agricoltura', 'pesca', 'acquacoltura'],
  aidHighlights: [
    'voucher di avvio fino a 40.000 euro (fino a 50.000 euro con maggiorazione), 100% a fondo perduto',
    'contributo su investimenti: 75% fino a 120.000 euro',
    'contributo su investimenti: 70% oltre 120.000 e fino a 200.000 euro',
  ],
  voucherBaseMaxEur: 40_000,
  voucherWithBonusMaxEur: 50_000,
  investmentAidBands: [
    { maxProjectAmountEur: 120_000, grantRatePct: 75, label: 'fino a 120.000 euro: contributo 75%' },
    { maxProjectAmountEur: 200_000, grantRatePct: 70, label: 'oltre 120.000 e fino a 200.000 euro: contributo 70%' },
  ],
  projectTimelineLabel:
    'voucher: spese entro 9 mesi (proroga una tantum fino a 12); investimento: 16 mesi (proroga fino a 20)',
  salRuleLabel:
    'Sui SAL RSUD è prevista maggiore flessibilità: in prima richiesta sono ammesse anche fatture non ancora quietanzate se sostenute/documentate.',
  deMinimisLabel: 'regime de minimis con massimale complessivo 200.000 euro in 3 esercizi finanziari',
  eligibleExpenses: [...COMMON_ELIGIBLE_EXPENSES, 'opere edili/ristrutturazioni solo nel canale investimento (max 50% del programma)'],
  nonEligibleExpenses: [...COMMON_NON_ELIGIBLE_EXPENSES, 'opere edili nel solo voucher', 'campagne ADV operative non capitalizzabili'],
  officialSources: [
    'https://www.invitalia.it/incentivi-e-strumenti/resto-al-sud-20',
    'https://www.invitalia.it/incentivi-e-strumenti/resto-al-sud-20/agevolazioni',
    'https://www.invitalia.it/incentivi-e-strumenti/resto-al-sud-20/faq',
    'https://www.invitalia.it/incentivi-e-strumenti/resto-al-sud-20/normativa',
  ],
  supportingSources: [
    'Guida tecnica per AI su Resto al Sud 2.0 e Autoimpiego Centro-Nord.docx',
    'Casi pratici complessi e FAQ operative per Resto al Sud 2.0 e Autoimpiego Centro-Nord.docx',
  ],
};

const AUTOIMPIEGO_CENTRO_NORD: LimitedPiaMeasure = {
  id: 'autoimpiego-centro-nord',
  title: 'Autoimpiego Centro Nord',
  territoryLabel: 'Regioni del Centro e del Nord Italia',
  territories: [
    'Emilia-Romagna',
    'Friuli-Venezia Giulia',
    'Lazio',
    'Liguria',
    'Lombardia',
    'Marche',
    'Piemonte',
    'Provincia Autonoma di Bolzano',
    'Provincia Autonoma di Trento',
    'Toscana',
    'Umbria',
    "Valle d'Aosta",
    'Veneto',
  ],
  openingDateLabel: '15/10/2025 (procedura a sportello)',
  responseTimingLabel: 'Invitalia indica esame domanda entro 90 giorni dalla presentazione',
  timingNotes: [...COMMON_TIMING_NOTES],
  beneficiaries: [...COMMON_BENEFICIARIES],
  legalForms: [...COMMON_LEGAL_FORMS],
  keyRequirements: [...COMMON_KEY_REQUIREMENTS],
  governanceRuleLabel:
    'nelle società, i soggetti con requisiti devono detenere almeno il 50% + 1 euro delle quote e la maggioranza della governance',
  atecoLockRuleLabel:
    'il richiedente non deve essere stato socio/titolare, nei 6 mesi precedenti, di attività con ATECO coincidente nelle prime 3 cifre',
  oneApplicationRuleLabel: 'non è possibile avere più domande attive contemporaneamente per lo stesso soggetto',
  exclusions: ['agricoltura', 'pesca', 'acquacoltura'],
  aidHighlights: [
    'voucher di avvio fino a 30.000 euro (fino a 40.000 euro con maggiorazione), 100% a fondo perduto',
    'contributo su investimenti: 65% fino a 120.000 euro',
    'contributo su investimenti: 60% oltre 120.000 e fino a 200.000 euro',
  ],
  voucherBaseMaxEur: 30_000,
  voucherWithBonusMaxEur: 40_000,
  investmentAidBands: [
    { maxProjectAmountEur: 120_000, grantRatePct: 65, label: 'fino a 120.000 euro: contributo 65%' },
    { maxProjectAmountEur: 200_000, grantRatePct: 60, label: 'oltre 120.000 e fino a 200.000 euro: contributo 60%' },
  ],
  projectTimelineLabel:
    'voucher: spese entro 9 mesi (proroga una tantum fino a 12); investimento: 16 mesi (proroga fino a 20)',
  salRuleLabel:
    'Sui SAL ACN le spese devono essere quietanzate: servono fatture già pagate e prova del pagamento.',
  deMinimisLabel: 'regime de minimis con massimale complessivo 200.000 euro in 3 esercizi finanziari',
  eligibleExpenses: [...COMMON_ELIGIBLE_EXPENSES, 'opere edili/ristrutturazioni solo nel canale investimento (max 50% del programma)'],
  nonEligibleExpenses: [...COMMON_NON_ELIGIBLE_EXPENSES, 'opere edili nel solo voucher'],
  officialSources: [
    'https://www.invitalia.it/incentivi-e-strumenti/autoimpiego-centro-nord',
    'https://www.invitalia.it/incentivi-e-strumenti/autoimpiego-centro-nord/agevolazioni',
    'https://www.invitalia.it/incentivi-e-strumenti/autoimpiego-centro-nord/faq',
    'https://www.invitalia.it/incentivi-e-strumenti/autoimpiego-centro-nord/normativa',
  ],
  supportingSources: [
    'Guida tecnica per AI su Resto al Sud 2.0 e Autoimpiego Centro-Nord.docx',
    'Casi pratici complessi e FAQ operative per Resto al Sud 2.0 e Autoimpiego Centro-Nord.docx',
  ],
};

const LIMITED_MEASURES: Record<LimitedPiaMeasureId, LimitedPiaMeasure> = {
  'resto-al-sud-20': RESTO_AL_SUD_20,
  'autoimpiego-centro-nord': AUTOIMPIEGO_CENTRO_NORD,
};

type Topic =
  | 'requirements'
  | 'expenses'
  | 'timing'
  | 'aid'
  | 'territory'
  | 'comparison'
  | 'ateco'
  | 'governance'
  | 'de_minimis'
  | 'sal'
  | 'naspi'
  | 'application_rules'
  | 'general';

function joinTop(values: string[], count = 3) {
  return values.slice(0, count).join('; ');
}

function euros(value: number) {
  return `${Math.round(value).toLocaleString('it-IT')} euro`;
}

function compactDirectAnswer(message: string) {
  const trimmed = String(message ?? '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  const sentences = trimmed.split(/(?<=[.!?])\s+/).map((entry) => entry.trim()).filter(Boolean);
  const firstSentence = sentences[0] ?? trimmed;
  const secondSentence = sentences[1] ?? '';
  const thirdSentence = sentences[2] ?? '';
  const firstNorm = normalizeForMatch(firstSentence);
  if (/^la risposta breve e (no|si|sì)/.test(firstNorm)) return firstSentence;
  if (/^(s(i|ì)\.|no\.|dipende\.)$/i.test(firstSentence) && secondSentence) {
    if (
      thirdSentence &&
      /\b(non|pero|però|tuttavia|ma|resto al sud|autoimpiego|centro nord)\b/.test(normalizeForMatch(thirdSentence))
    ) {
      return `${firstSentence} ${secondSentence} ${thirdSentence}`;
    }
    return `${firstSentence} ${secondSentence}`;
  }
  if (/^(s(i|ì)\.|no\.|no\b|dipende\.)/i.test(firstSentence)) {
    return secondSentence ? `${firstSentence} ${secondSentence}` : firstSentence;
  }
  if (
    secondSentence &&
    /\b(non|pero|però|tuttavia|ma|resto al sud|autoimpiego|centro nord)\b/.test(normalizeForMatch(secondSentence))
  ) {
    return `Dipende. ${firstSentence} ${secondSentence}`;
  }
  return `Dipende. ${firstSentence}`;
}

function commonQuizCta() {
  return 'Prossimo passo: clicca il pulsante "Verifica requisiti" per l’esito guidato.';
}

function commonComplianceClosing() {
  return 'I riferimenti tecnici sono allineati alle FAQ e alla normativa ufficiale Invitalia, ma la pratica viene gestita dai consulenti BNDO: non devi presentare la domanda in autonomia sul portale.';
}

function mentionsBothMeasures(normMessage: string) {
  const hasResto = /\bresto al sud\b/.test(normMessage);
  const hasAutoimpiego = /\bautoimpiego\b/.test(normMessage) && /\bcentro\b/.test(normMessage) && /\bnord\b/.test(normMessage);
  return hasResto && hasAutoimpiego;
}

function detectTopic(message: string): Topic {
  const norm = normalizeForMatch(message);
  if (!norm) return 'general';

  if (mentionsBothMeasures(norm) || /\b(differenz|confront|paragon|meglio|quale conviene)\b/.test(norm)) {
    return 'comparison';
  }
  if (/(ateco|6 mesi|sei mesi|stesso codice|codice coincidente|attivita precedente|partita iva attiva)/.test(norm)) {
    return 'ateco';
  }
  if (/(soci|quote|governance|maggioranza|controllo societa|socio over|socio senza requisiti)/.test(norm)) {
    return 'governance';
  }
  if (/(de minimis|cumul|massimal|200000|200 mila|200 mila euro|altri incentivi)/.test(norm)) {
    return 'de_minimis';
  }
  if (/(sal|quietanzat|fatture pagate|fatture non pagate|erogazione)/.test(norm)) {
    return 'sal';
  }
  if (/(naspi|gol|inps)/.test(norm)) {
    return 'naspi';
  }
  if (/(domande|piu domande|piu richieste|una sola domanda|ripresentare)/.test(norm)) {
    return 'application_rules';
  }
  if (/(spes|ammissibil|costi|macchinar|software|attrezzatur|arred|ristruttur|edili|leasing|affitt|utenz|stipendi)/.test(norm)) {
    return 'expenses';
  }
  if (/(chi puo|chi può|requisit|beneficiar|eta|età|disoccup|working poor|inattiv|inoccupat|forma giuridica)/.test(norm)) {
    return 'requirements';
  }
  if (/(entro quanto|quanto tempo|quando|apre|apertura|scadenz|domanda|procedura|sportello|tempi|tempistiche|risposta|esito|istruttori)/.test(norm)) {
    return 'timing';
  }
  if (/(quanto posso|quanto copre|quanto finanzia|import|agevolaz|copertura|percentual|fondo perduto|voucher|70|75|65|60|100)/.test(norm)) {
    return 'aid';
  }
  if (/(regione|territor|dove|sud|centro|nord|sede operativa|sede)/.test(norm)) {
    return 'territory';
  }
  return 'general';
}

function buildComparisonReply() {
  const resto = RESTO_AL_SUD_20;
  const acn = AUTOIMPIEGO_CENTRO_NORD;
  return [
    'Confronto rapido RSUD vs ACN:',
    `1) Territorio: ${resto.title} copre Mezzogiorno (più aree sismiche previste); ${acn.title} copre Centro-Nord.`,
    `2) Voucher: ${resto.title} fino a ${euros(resto.voucherBaseMaxEur)} (fino a ${euros(resto.voucherWithBonusMaxEur)} con maggiorazione); ${acn.title} fino a ${euros(acn.voucherBaseMaxEur)} (fino a ${euros(acn.voucherWithBonusMaxEur)}).`,
    `3) Contributo investimenti: ${resto.investmentAidBands[0]!.label}, ${resto.investmentAidBands[1]!.label}; ${acn.investmentAidBands[0]!.label}, ${acn.investmentAidBands[1]!.label}.`,
    `4) SAL: ${resto.title} è più flessibile sulle fatture non quietanzate in prima richiesta; ${acn.title} richiede fatture quietanzate.`,
    `5) Regole comuni: età 18-35 non compiuti, stato occupazionale coerente, esclusioni settoriali (agricoltura/pesca/acquacoltura), regime de minimis.`,
  ].join('\n');
}

function buildCaseSpecificReply(measure: LimitedPiaMeasure, messageNorm: string): string | null {
  if (/(over 35|piu di 35|più di 35|\b36 anni\b|\b37 anni\b|\b38 anni\b|\b39 anni\b|\b4\d anni\b|\b5\d anni\b)/.test(messageNorm)) {
    return [
      `Per ${measure.title} i beneficiari diretti devono avere tra 18 anni compiuti e 35 anni non compiuti alla data di presentazione della domanda.`,
      'Se hai più di 35 anni non rientri come beneficiario diretto.',
      `Puoi eventualmente essere socio non beneficiario, ma resta vincolante la regola: ${measure.governanceRuleLabel}.`,
    ].join(' ');
  }

  if (/(socio|soci).*(over 35|senza requisiti|investitore)/.test(messageNorm)) {
    return [
      `Sì, ${measure.title} consente soci senza requisiti, ma solo in minoranza.`,
      `Vincolo operativo: ${measure.governanceRuleLabel}.`,
      'Il socio over 35 può apportare capitale, ma non può controllare la società né sostituire i beneficiari nei ruoli di governo.',
    ].join(' ');
  }

  if (/\b(trasfer\w*|spost\w*|cambio sede|spostare la sede|trasferire la sede)\b/.test(messageNorm)) {
    return [
      'Attenzione: il territorio del bando è vincolante.',
      `Per ${measure.title} devi mantenere la sede operativa nell’area ammessa durante il periodo di vincolo.`,
      'Uno spostamento stabile fuori perimetro può comportare revoca (totale o parziale) e restituzione delle somme.',
    ].join(' ');
  }

  if (/\bcoworking\b/.test(messageNorm)) {
    return [
      'Sì, il coworking può essere usato come sede operativa se hai titolo giuridico valido (contratto/uso sede coerente).',
      'No, il canone di affitto coworking non è una spesa agevolabile: rientra nei costi di gestione.',
    ].join(' ');
  }

  if (/(fatture estere|fornitore estero|fornitore ue|fornitore europeo)/.test(messageNorm)) {
    return [
      'In linea generale sì: fornitori UE/esteri sono possibili se la spesa è coerente col progetto.',
      'Servono fatture intestate al beneficiario, pagamenti tracciabili e documentazione fiscale conforme (inclusi eventuali adempimenti IVA/doganali).',
    ].join(' ');
  }

  if (/(proroga|ritardo|fornitura in ritardo|ritardi autorizzazioni|autorizzazioni asl|ritardi comunali)/.test(messageNorm)) {
    return [
      'Sì, di norma puoi chiedere proroga motivata e documentata entro i termini procedurali.',
      `Timeline base: ${measure.projectTimelineLabel}.`,
      'Senza proroga autorizzata, il mancato rispetto dei tempi può portare a riduzione/revoca delle agevolazioni.',
    ].join(' ');
  }

  if (/(e-?commerce|solo online|attivita online|attivita solo online)/.test(messageNorm)) {
    return [
      'Sì, un’attività online può essere ammissibile se è una vera iniziativa economica (P.IVA, ATECO coerente, operatività reale).',
      'Sono tipicamente ammissibili piattaforma, software, hardware e servizi tecnici capitalizzabili.',
      'Restano esclusi scorte/materie prime, campagne ADV operative e costi ricorrenti di gestione.',
    ].join(' ');
  }

  if (/(compio 35|compie 35|35 anni durante|supero 35|dopo la domanda)/.test(messageNorm)) {
    return 'Conta l’età alla data di presentazione della domanda: se eri under 35 in quella data, il compimento successivo dei 35 anni non blocca la pratica.';
  }

  if (measure.id === 'autoimpiego-centro-nord' && /(stp|societa tra professionisti|studio professionale)/.test(messageNorm)) {
    return [
      'Sì, in ACN sono ammesse anche attività libero-professionali e STP.',
      `Restano fermi i vincoli societari: ${measure.governanceRuleLabel}.`,
      'Affitti/utenze restano costi non agevolabili.',
    ].join(' ');
  }

  if (
    measure.id === 'autoimpiego-centro-nord' &&
    /(subentro|rilevar|rilevamento|attivita esistente|bar esistente|locale esistente)/.test(messageNorm)
  ) {
    return [
      'Il subentro in un’attività/locali esistenti può essere ammissibile.',
      `Punto chiave: ${measure.atecoLockRuleLabel}.`,
      'Se non eri socio/titolare con lo stesso ATECO nelle prime 3 cifre nei 6 mesi precedenti, il caso è di norma valutabile.',
    ].join(' ');
  }

  if (measure.id === 'autoimpiego-centro-nord' && /(sviluppo interno|lavoro interno|ore interne|lavoro dei soci)/.test(messageNorm)) {
    return [
      'No, il lavoro interno dei soci non è rendicontabile come spesa agevolata.',
      'Sono rendicontabili i costi fatturati da terzi (hardware, software, cloud, consulenze specialistiche, certificazioni).',
    ].join(' ');
  }

  return null;
}

function buildSpecializedReply(measure: LimitedPiaMeasure, topic: Topic, messageNorm: string) {
  const caseSpecific = buildCaseSpecificReply(measure, messageNorm);
  if (caseSpecific) return caseSpecific;

  switch (topic) {
    case 'ateco':
      return [
        `Regola ATECO (${measure.title}): ${measure.atecoLockRuleLabel}.`,
        'Quindi, se hai una partita IVA attiva o un’attività cessata da meno di 6 mesi con stesse prime 3 cifre ATECO, in genere non sei ammissibile.',
      ].join(' ');
    case 'governance':
      return [
        `Regola soci/governance (${measure.title}): ${measure.governanceRuleLabel}.`,
        'La presenza di soci senza requisiti è possibile solo in minoranza e senza controllo della società.',
      ].join(' ');
    case 'de_minimis':
      return [
        `Cumulo aiuti: ${measure.deMinimisLabel}.`,
        'Puoi combinare altre agevolazioni solo evitando doppio finanziamento delle stesse spese e rispetto dei limiti complessivi.',
      ].join(' ');
    case 'sal':
      return measure.salRuleLabel;
    case 'naspi':
      return [
        `${measure.title}: la combinazione con NASpI va gestita in modo prudente.`,
        'In pratica, la casistica tipica è NASpI anticipata in unica soluzione come capitale nel progetto; la NASpI mensile va verificata con regole INPS.',
      ].join(' ');
    case 'application_rules':
      return [
        `${measure.oneApplicationRuleLabel}.`,
        'Dopo rigetto o rinuncia puoi presentare una nuova domanda, verificando di nuovo i requisiti temporali.',
      ].join(' ');
    case 'requirements':
      return [
        `Requisiti principali ${measure.title}: ${joinTop(measure.beneficiaries, 3)}.`,
        `Forme ammesse: ${joinTop(measure.legalForms, 3)}.`,
        `Requisiti operativi: ${joinTop(measure.keyRequirements, 3)}.`,
      ].join(' ');
    case 'expenses':
      if (/\bleasing\b/.test(messageNorm)) {
        return 'Leasing (operativo o finanziario): non è considerato spesa ammissibile nel piano agevolato.';
      }
      if (/\baffitt|utenz|stipend|personale|materie prime|scorte\b/.test(messageNorm)) {
        return `No: affitti, utenze, personale e scorte rientrano nei costi di gestione e non sono agevolabili.`;
      }
      return [
        `Spese ammissibili ${measure.title}: ${joinTop(measure.eligibleExpenses, 4)}.`,
        `Spese escluse: ${joinTop(measure.nonEligibleExpenses, 4)}.`,
      ].join(' ');
    case 'timing':
      return [
        `Tempistiche ${measure.title}: ${measure.responseTimingLabel}.`,
        `Progetto: ${measure.projectTimelineLabel}.`,
        `Note operative: ${joinTop(measure.timingNotes, 3)}.`,
      ].join(' ');
    case 'aid':
      return [
        `Agevolazioni ${measure.title}: voucher fino a ${euros(measure.voucherBaseMaxEur)} (fino a ${euros(measure.voucherWithBonusMaxEur)} con maggiorazione).`,
        `Contributo investimenti: ${measure.investmentAidBands[0]!.label}; ${measure.investmentAidBands[1]!.label}.`,
      ].join(' ');
    case 'territory':
      return [
        `Territorio ${measure.title}: ${measure.territoryLabel}.`,
        `Regioni principali: ${joinTop(measure.territories, 7)}.`,
      ].join(' ');
    case 'general':
    default:
      return [
        `${measure.title}: ${measure.aidHighlights[0]}.`,
        `Inoltre: ${measure.aidHighlights[1]}; ${measure.aidHighlights[2]}.`,
        `Requisiti chiave: ${joinTop(measure.beneficiaries, 2)}; ${joinTop(measure.keyRequirements, 2)}.`,
      ].join(' ');
  }
}

export function isLimitedPiaMeasureId(value: string | null | undefined): value is LimitedPiaMeasureId {
  return value === 'resto-al-sud-20' || value === 'autoimpiego-centro-nord';
}

export function getLimitedPiaMeasure(measureId: LimitedPiaMeasureId): LimitedPiaMeasure {
  return LIMITED_MEASURES[measureId];
}

export function resolveLimitedPiaMeasureFromText(message: string): LimitedPiaMeasureId | null {
  const norm = normalizeForMatch(message);
  if (!norm) return null;
  if (/\bresto al sud\b/.test(norm)) return 'resto-al-sud-20';
  if (/\bautoimpiego\b/.test(norm) && /\bcentro\b/.test(norm) && /\bnord\b/.test(norm)) {
    return 'autoimpiego-centro-nord';
  }
  return null;
}

export function buildLimitedPiaConsultantReply(args: {
  measureId: LimitedPiaMeasureId;
  message: string;
  directAnswer?: string | null;
}) {
  const messageNorm = normalizeForMatch(args.message);
  const measure = LIMITED_MEASURES[args.measureId];
  const topic = detectTopic(args.message);
  const directAnswer = compactDirectAnswer(args.directAnswer ?? '');
  const parts: string[] = [];

  if (directAnswer) {
    parts.push(directAnswer);
  }

  if (topic === 'comparison' || mentionsBothMeasures(messageNorm)) {
    parts.push(buildComparisonReply());
    parts.push(commonComplianceClosing());
    parts.push(commonQuizCta());
    return parts.join('\n\n');
  }

  const specialized = buildSpecializedReply(measure, topic, messageNorm);
  parts.push(specialized);

  if (topic === 'general') {
    parts.push(
      `Alert operativi ricorrenti: ${measure.atecoLockRuleLabel}; ${measure.oneApplicationRuleLabel}; esclusi ${joinTop(measure.exclusions, 3)}.`
    );
  }

  parts.push(commonComplianceClosing());
  parts.push(commonQuizCta());

  return parts.join('\n\n');
}

export function getLimitedPiaOfficialSources(measureId: LimitedPiaMeasureId) {
  return [...LIMITED_MEASURES[measureId].officialSources];
}
