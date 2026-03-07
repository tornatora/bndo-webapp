export function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isQuestionLike(message: string) {
  const t = message.trim();
  if (!t) return false;
  if (t.includes('?')) return true;
  const n = normalizeForMatch(t);
  return (
    n.startsWith('come ') ||
    n.startsWith('cosa ') ||
    n.startsWith('quali ') ||
    n.startsWith('quanto ') ||
    n.startsWith('quando ') ||
    n.startsWith('posso ') ||
    n.startsWith('mi conviene') ||
    n.includes('differenza tra') ||
    n.includes('che cos') ||
    n.includes('requisiti') ||
    n.includes('spese ammiss') ||
    n.includes('a sportello') ||
    n.includes('de minimis')
  );
}

export function isSmallTalkOnly(message: string) {
  const n = normalizeForMatch(message);
  if (!n) return false;
  const compact = n.replace(/\s+/g, ' ').trim();
  const small = [
    'ok',
    'okay',
    'va bene',
    'perfetto',
    'bene',
    'grazie',
    'grazie mille',
    'ok grazie',
    'capito',
    'chiaro',
    'ciao',
    'salve'
  ];
  if (small.includes(compact)) return true;
  return compact.length <= 3;
}

export function isGreeting(message: string) {
  const n = normalizeForMatch(message);
  if (!n) return false;
  return (
    n === 'ciao' ||
    n === 'salve' ||
    n.includes('buongiorno') ||
    n.includes('buonasera') ||
    n.includes('buon pomeriggio') ||
    n.includes('hey') ||
    n.includes('ehi')
  );
}

export function isConversationalIntent(message: string) {
  const n = normalizeForMatch(message);
  if (!n) return false;
  return (
    n.includes('possiamo prima parlare') ||
    n.includes('parliamo prima') ||
    n.includes('prima parliamo') ||
    n.includes('spiegami meglio') ||
    n.includes('fammi capire') ||
    n.includes('non ho capito')
  );
}

export function wantsQuestionsFirst(message: string) {
  const n = normalizeForMatch(message);
  if (!n) return false;
  return (
    (n.includes('domand') && (n.includes('prima') || n.includes('qualche'))) ||
    n.includes('parlare prima') ||
    n.includes('prima di tutto')
  );
}

export function wantsToProceedToMatching(message: string) {
  const n = normalizeForMatch(message);
  if (!n) return false;
  return (
    n.includes('procediamo') ||
    n.includes('andiamo avanti') ||
    n.includes('passiamo al matching') ||
    n.includes('facciamo matching') ||
    n.includes('trova bandi') ||
    n.includes('scanner bandi')
  );
}

export function isDirectQuestionOnMeasure(message: string) {
  const n = normalizeForMatch(message);
  if (!n) return false;
  const measures = [
    'resto al sud',
    'nuova sabatini',
    'smart&start',
    'oltre nuove imprese',
    'on tasso zero',
    'credito d imposta',
    'transizione 5.0',
    'transizione 4.0',
    'voucher internazionalizzazione',
    'voucher digitalizzazione',
    'autoimpiego centro nord',
    'fusese'
  ];
  const questionKeywords = ['come funziona', 'posso finanziare', 'copre', 'vale per', 'requisiti', 'spese ammissibili', 'quando scade'];
  
  const mentionsMeasure = measures.some(m => n.includes(m));
  const isQuestion = isQuestionLike(message) || questionKeywords.some(k => n.includes(k));
  
  return mentionsMeasure && isQuestion;
}

export function isEligibilityCheck(message: string) {
  const n = normalizeForMatch(message);
  if (!n) return false;
  return (
    (n.includes('posso accedere') || n.includes('ho i requisiti') || n.includes('va bene per me') || n.includes('posso partecipare')) &&
    (n.includes('sono') || n.includes('abbiamo') || n.includes('ho'))
  );
}

export function isDiscoveryIntent(message: string) {
  const n = normalizeForMatch(message);
  if (!n) return false;
  return (
    (n.includes('cerco') || n.includes('voglio') || n.includes('vorrei') || n.includes('mi serve') || n.includes('bando per')) &&
    !isDirectQuestionOnMeasure(message)
  );
}

export function wantsHumanConsultant(message: string) {
  const n = normalizeForMatch(message);
  if (!n) return false;
  return (
    (n.includes('consulente') && (n.includes('umano') || n.includes('persona') || n.includes('vero'))) ||
    n.includes('parlare con un consulente') ||
    n.includes('voglio parlare con un consulente') ||
    n.includes('farmi chiamare') ||
    n.includes('ricontattare') ||
    n.includes('contatto telefonico')
  );
}

export type TurnIntent = {
  questionLike: boolean;
  smallTalk: boolean;
  greeting: boolean;
  conversationalIntent: boolean;
  questionsFirst: boolean;
  proceedToMatching: boolean;
  asksHumanConsultant: boolean;
  qaModeActive: boolean;
  directQuestionOnMeasure: boolean;
  eligibilityCheck: boolean;
  discovery: boolean;
};

export function detectTurnIntent(args: {
  message: string;
  sessionQaMode: boolean;
}) {
  const { message, sessionQaMode } = args;
  const questionLike = isQuestionLike(message);
  const smallTalk = isSmallTalkOnly(message);
  const greeting = isGreeting(message);
  const conversationalIntent = isConversationalIntent(message);
  const questionsFirst = wantsQuestionsFirst(message);
  const proceedToMatching = wantsToProceedToMatching(message);
  const asksHumanConsultant = wantsHumanConsultant(message);
  const directQuestionOnMeasure = isDirectQuestionOnMeasure(message);
  const eligibilityCheck = isEligibilityCheck(message);
  const discovery = isDiscoveryIntent(message);
  
  const qaModeActive = Boolean((sessionQaMode || questionsFirst || directQuestionOnMeasure || eligibilityCheck) && !proceedToMatching);
  
  const modeHint: 'qa' | 'handoff_human' | 'profiling' | 'small_talk' | 'scan_refine' | 'discovery' =
    asksHumanConsultant
      ? 'handoff_human'
      : directQuestionOnMeasure || eligibilityCheck
        ? 'qa'
        : discovery
          ? 'discovery'
          : qaModeActive || questionLike || conversationalIntent
            ? 'qa'
            : smallTalk
              ? 'small_talk'
              : proceedToMatching
                ? 'scan_refine'
                : 'profiling';

  return {
    questionLike,
    smallTalk,
    greeting,
    conversationalIntent,
    questionsFirst,
    proceedToMatching,
    asksHumanConsultant,
    qaModeActive,
    directQuestionOnMeasure,
    eligibilityCheck,
    discovery,
    modeHint
  };
}

