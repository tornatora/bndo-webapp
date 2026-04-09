/**
 * Centralized profile extraction from user messages.
 * Contains parsers for region, budget, sector, ateco, age, employment, etc.
 */
import { normalizeForMatch } from '@/lib/text/normalize';
import type { ContributionPreference, UserProfile } from '@/lib/conversation/types';

const IT_REGIONS = [
  'Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Emilia-Romagna',
  'Friuli-Venezia Giulia', 'Lazio', 'Liguria', 'Lombardia', 'Marche',
  'Molise', 'Piemonte', 'Puglia', 'Sardegna', 'Sicilia', 'Toscana',
  'Trentino-Alto Adige', 'Umbria', "Valle d'Aosta", 'Veneto',
] as const;

const REGION_DEMONYM_MAP: Array<{ region: (typeof IT_REGIONS)[number]; tokens: string[] }> = [
  { region: 'Abruzzo', tokens: ['abruzzese', 'abruzzesi'] },
  { region: 'Basilicata', tokens: ['lucano', 'lucana', 'lucani', 'lucane', 'basilicatese', 'basilicatesi'] },
  { region: 'Calabria', tokens: ['calabrese', 'calabresi'] },
  { region: 'Campania', tokens: ['campano', 'campana', 'campani', 'campane'] },
  { region: 'Emilia-Romagna', tokens: ['emiliano', 'emiliana', 'romagnolo', 'romagnola'] },
  { region: 'Friuli-Venezia Giulia', tokens: ['friulano', 'friulana', 'giuliano', 'giuliana'] },
  { region: 'Lazio', tokens: ['laziale', 'laziali'] },
  { region: 'Liguria', tokens: ['ligure', 'liguri'] },
  { region: 'Lombardia', tokens: ['lombardo', 'lombarda', 'lombardi', 'lombarde'] },
  { region: 'Marche', tokens: ['marchigiano', 'marchigiana'] },
  { region: 'Molise', tokens: ['molisano', 'molisana'] },
  { region: 'Piemonte', tokens: ['piemontese', 'piemontesi'] },
  { region: 'Puglia', tokens: ['pugliese', 'pugliesi'] },
  { region: 'Sardegna', tokens: ['sardo', 'sarda', 'sardi', 'sarde'] },
  { region: 'Sicilia', tokens: ['siciliano', 'siciliana', 'siciliani', 'siciliane'] },
  { region: 'Toscana', tokens: ['toscano', 'toscana'] },
  { region: 'Trentino-Alto Adige', tokens: ['trentino', 'altoatesino', 'altoatesina'] },
  { region: 'Umbria', tokens: ['umbro', 'umbra'] },
  { region: "Valle d'Aosta", tokens: ['valdostano', 'valdostana'] },
  { region: 'Veneto', tokens: ['veneto', 'veneta', 'veneti', 'venete'] },
];

export type RegionSignal = { region: string; source: 'explicit' | 'demonym' };

export type ExtractedProfile = {
  updates: Partial<UserProfile>;
  slotSource: Partial<Record<string, 'explicit' | 'demonym' | 'inferred'>>;
};

function detectRegionByDemonym(message: string): string | null {
  const norm = normalizeForMatch(message);
  if (!norm) return null;
  for (const entry of REGION_DEMONYM_MAP) {
    if (entry.tokens.some((token) => ` ${norm} `.includes(` ${normalizeForMatch(token)} `))) {
      return entry.region;
    }
  }
  return null;
}

/**
 * Detecting negation patterns: if the user says "non sono in Calabria"
 * the region should NOT be extracted.
 */
function hasRegionNegation(message: string, regionNorm: string): boolean {
  const norm = normalizeForMatch(message);
  
  // Strong direct negative phrases encompassing region
  const strongNegations = [
    `non sono in ${regionNorm}`, `non siamo in ${regionNorm}`, 
    `non opero in ${regionNorm}`, `non operiamo in ${regionNorm}`,
    `non ho sede in ${regionNorm}`, `non abbiamo sede in ${regionNorm}`, 
    `non mi trovo in ${regionNorm}`, `non e in ${regionNorm}`,
    `non e a ${regionNorm}`, `fuori da ${regionNorm}`, 
    `fuori dalla ${regionNorm}`, `fuori dal ${regionNorm}`,
    `escluso ${regionNorm}`, `esclusa ${regionNorm}`, `tranne ${regionNorm}`,
    `ad eccezione di ${regionNorm}`, `tutto tranne ${regionNorm}`,
    `tranne in ${regionNorm}`, `escluso in ${regionNorm}`
  ];

  for (const pattern of strongNegations) {
    if (norm.includes(pattern) || norm.includes(pattern.replace(/\s+/g, ''))) return true;
  }

  const words = norm.split(/\s+/);
  const regionIdx = words.findIndex(w => w === regionNorm || regionNorm.startsWith(w));
  if (regionIdx === -1) return false;
  
  // Check if 'non' is within 3 words before the region
  const nonIdx = words.lastIndexOf('non', regionIdx);
  if (nonIdx !== -1 && regionIdx - nonIdx <= 3) {
    // Make sure it's not a positive reinforcement like "non credo ci siano problemi per la calabria" 
    // Usually a "non" close to a region implies "I am not in" unless there's a strong context of "non solo"
    const between = words.slice(nonIdx, regionIdx).join(' ');
    if (between.includes('solo')) return false; // "non solo in calabria" -> means YES
    return true;
  }
  
  return false;
}

export function detectRegionSignal(message: string): RegionSignal | null {
  const norm = normalizeForMatch(message);
  for (const r of IT_REGIONS) {
    const rn = normalizeForMatch(r);
    if (` ${norm} `.includes(` ${rn} `)) {
      // Check for negation before confirming
      if (hasRegionNegation(message, rn)) return null;

      // PROACTIVE FIX: if user says "in [Region]", "a [Region]", "sede in [Region]", 
      // we are highly confident and don't need confirmation.
      const confidencePatterns = [
        `in ${rn}`, `a ${rn}`, `nella ${rn}`, `nelle ${rn}`, 
        `sede a ${rn}`, `sede in ${rn}`, `operiamo in ${rn}`, `operiamo a ${rn}`,
        `comune di ${rn}`, `provincia di ${rn}`
      ];
      const isVeryConfident = confidencePatterns.some(p => norm.includes(p)) || norm === rn;

      return { 
        region: r, 
        source: 'explicit',
        isHighConfidence: isVeryConfident
      } as any; // Cast as any since we are adding a temporary flag for the extractor bridge
    }
  }
  const demonymRegion = detectRegionByDemonym(message);
  if (demonymRegion) return { region: demonymRegion, source: 'demonym' };
  return null;
}

export function detectRegionAnywhere(message: string): string | null {
  return detectRegionSignal(message)?.region ?? null;
}

export function userIsStatingOwnLocation(message: string): boolean {
  const n = normalizeForMatch(message);
  return (
    n.includes('regione') ||
    n.includes('sono in') ||
    n.includes('siamo in') ||
    n.includes('operiamo in') ||
    n.includes('sede in') ||
    n.includes('ho sede') ||
    n.includes('mi trovo in') ||
    n.includes('mi trovo a') ||
    n.includes('azienda in') ||
    n.includes('attivita in') ||
    Boolean(detectRegionByDemonym(message))
  );
}

export function parseRegionAndMunicipality(message: string): { region: string | null; municipality: string | null } {
  const cleaned = message.trim();
  const norm = normalizeForMatch(cleaned);
  const regionSignal = detectRegionSignal(cleaned);
  const explicitRegionHit =
    IT_REGIONS.find((r) => normalizeForMatch(r) === norm) ??
    IT_REGIONS.find((r) => normalizeForMatch(r).includes(norm) || norm.includes(normalizeForMatch(r))) ??
    (regionSignal?.source === 'explicit' ? regionSignal.region : null);
  const demonymRegion = detectRegionByDemonym(cleaned);
  const regionHit = explicitRegionHit ?? demonymRegion ?? null;

  if (cleaned.includes(',')) {
    const parts = cleaned.split(',').map((p) => p.trim()).filter(Boolean);
    const a = parts[0] ?? '';
    const b = parts[1] ?? '';
    const aIsRegion = IT_REGIONS.some((r) => normalizeForMatch(r) === normalizeForMatch(a));
    const bIsRegion = IT_REGIONS.some((r) => normalizeForMatch(r) === normalizeForMatch(b));
    if (aIsRegion && b) return { region: a, municipality: b };
    if (bIsRegion && a) return { region: b, municipality: a };
  }

  if (regionHit) return { region: regionHit, municipality: null };
  return { region: null, municipality: null };
}

export function parseBudgetEUR(message: string): number | null {
  const lowered = message.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!lowered) return null;
  // Anti-collision with age
  if (/\b\d{1,3}\s+anni\b/.test(lowered) || /\beta(?:')?\s*(?:di)?\s*\d{1,3}\b/.test(lowered)) return null;
  // Anti-collision with turnover (handled separately to avoid stealing budget)
  if (/(fatturat|ricavi|volume|vendit)/.test(lowered)) return null;

  const hasBudgetSignal =
    /\b(budget|investiment|spesa|euro|eur|contribut|finanziament|importo|capitale|progetto|serve|servono|costo|costa)\b/.test(lowered) ||
    /\b\d+(?:[.,]\d+)?\s*(mila|milioni|milione|k|m)\b/.test(lowered) ||
    /€/.test(lowered);

  if (!hasBudgetSignal) return null;

  const unitMatch = lowered.match(/\b(\d+(?:[.,]\d+)?)(?:\s*)(mila|milioni|milione|k|m)\b/i);
  if (unitMatch) {
    const base = Number.parseFloat(unitMatch[1]!.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(base) || base < 0) return null;
    const mult = unitMatch[2]!.toLowerCase();
    if (mult === 'k' || mult === 'mila') return Math.round(base * 1000);
    if (mult === 'm' || mult === 'milione' || mult === 'milioni') return Math.round(base * 1_000_000);
  }

  const amountMatch = lowered.match(/\b(\d{1,3}(?:[.\s]\d{3})+|\d{4,9})(?:,\d+)?\b/);
  if (!amountMatch) return null;
  const normalizedRaw = amountMatch[1]!.replace(/[.\s]/g, '');
  const base = Number.parseInt(normalizedRaw, 10);
  if (!Number.isFinite(base) || base < 0) return null;
  return base;
}

export function parseRequestedContributionEUR(message: string): number | null {
  const lowered = message.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!lowered) return null;
  const hasRequestSignal =
    /\b(ho bisogno|mi serve|mi servono|vorrei ottenere|richiedo|richiesta|contributo|agevolazione|fondi)\b/.test(lowered);
  if (!hasRequestSignal) return null;
  return parseBudgetEUR(message);
}

export function parseEmployees(message: string): number | null {
  const lowered = message.toLowerCase();
  if (/\bsolo io\b|\bda solo\b|\bda sola\b/.test(lowered)) return 1;
  if (/\bnessun\b|\bzero\b/.test(lowered)) return 0;

  const hasEmployeesSignal = /(dipendent|addett|collaborator|team|staff|organico|person[ae])/.test(lowered);
  if (!hasEmployeesSignal) return null;
  if (/(euro|eur|budget|investiment|spesa|fatturat|ricav)/.test(lowered)) return null;

  const m = lowered.match(/\b(\d{1,4})\b/);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  if (!Number.isFinite(n) || n < 0 || n > 50000) return null;
  return n;
}

export function parseBusinessExistsFromMessage(message: string): boolean | null {
  const n = normalizeForMatch(message);
  if (!n) return null;
  if (/(non ho (una |un )?(impresa|azienda|attivita)|da costituire|da aprire|devo aprire|devo avviare|voglio avviare|vorrei avviare|voglio aprire|vorrei aprire|sto avviando|sto aprendo|nuova attivita|nuova impresa|startup|autoimpiego|non e ancora attiva|ancora non esiste|non l ho ancora aperta|devo aprirla)/.test(n)) return false;
  if (/(gia attiva|già attiva|gia esistente|già esistente|impresa attiva|azienda attiva|attivita attiva|attivita avviata|ho gia un attivita|ho partita iva|ho un impresa|ho una impresa|ho un azienda|ho una azienda|abbiamo un impresa|abbiamo una azienda|sono titolare|impresa agricola|azienda agricola|operativa|gia operativa|già operativa|attiva|esiste gia|esiste già|ho gia l azienda|ho già l azienda|siamo gia operativi|siamo già operativi|societa attiva|società attiva)/.test(n)) return true;
  return null;
}

export function parseAge(message: string): number | null {
  const lowered = message.toLowerCase();
  
  // Anti-collision with business foundation age (e.g. "l'azienda ha 25 anni")
  const isBusinessAgeContext = /(azienda|societ|ditta|impresa|attivita|negozio|aperta da|esiste da)\s+(?:ha\s+)?(?:\d{1,3})\s+anni/i.test(lowered);
  if (isBusinessAgeContext) return null;

  const match =
    lowered.match(/\b(?:io\s+)?(?:ho\s+)(\d{2})\s+anni\b/) ??
    lowered.match(/\b(\d{2})\s+anni\b/) ??
    lowered.match(/\bet[aà](?:')?\s*(?:di)?\s*(\d{2})\b/) ??
    lowered.match(/\b(\d{2})\s+enne\b/);
    
  if (!match?.[1]) return null;
  const age = Number.parseInt(match[1], 10);
  if (!Number.isFinite(age) || age < 16 || age > 100) return null;
  return age;
}

export function parseAgeBand(message: string): UserProfile['ageBand'] {
  const lowered = normalizeForMatch(message);
  if (!lowered) return null;
  if (/\bunder\s*35\b|\bu35\b|meno di 35|sotto i 35|<\s*35|giovane\b/.test(lowered)) return 'under35';
  if (/\bover\s*35\b|oltre 35|piu di 35|sopra i 35|>\s*35/.test(lowered)) return 'over35';
  return null;
}

export function parseEmploymentStatus(message: string): string | null {
  const n = normalizeForMatch(message);
  if (!n) return null;
  if (/(disoccupat|senza lavoro|non occupat)/.test(n)) return 'disoccupato';
  if (/inoccupat/.test(n)) return 'inoccupato';
  if (/\bneet\b/.test(n)) return 'neet';
  if (/student/.test(n)) return 'studente';
  if (/(occupat|dipendent|lavoro dipendente|a tempo)/.test(n)) return 'occupato';
  if (/(autonom|partita iva|libero professionista)/.test(n)) return 'autonomo';
  return null;
}

export function parseLegalForm(message: string): string | null {
  const n = normalizeForMatch(message);
  if (!n) return null;
  if (/\bsrls\b/.test(n)) return 'SRLS';
  if (/\bsrl\b/.test(n)) return 'SRL';
  if (/\bspa\b/.test(n)) return 'SPA';
  if (/\bsnc\b/.test(n)) return 'SNC';
  if (/\bsas\b/.test(n)) return 'SAS';
  if (/\bcooperativ/.test(n)) return 'Cooperativa';
  if (/\bditta individuale\b|\bindividuale\b|\bditta\b/.test(n)) return 'Ditta individuale';
  if (/\blibero professionista\b|\bprofessionista\b|\bpartita iva\b/.test(n)) return 'Libero Professionista';
  return null;
}

export function parseEmail(message: string): string | null {
  const m = message.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  return m?.[0]?.toLowerCase() ?? null;
}

function normalizePhone(raw: string): string | null {
  let v = raw.trim();
  if (!v) return null;
  v = v.replace(/[^\d+]/g, '');
  if (v.startsWith('00')) v = `+${v.slice(2)}`;
  const digitsOnly = v.replace(/\D/g, '');
  if (digitsOnly.length < 8 || digitsOnly.length > 15) return null;
  if (v.startsWith('+')) return `+${digitsOnly}`;
  return digitsOnly;
}

export function parsePhone(message: string): string | null {
  const m = message.match(/(\+?\d[\d\s().-]{6,}\d)/);
  if (!m?.[1]) return null;
  return normalizePhone(m[1]);
}

export function parseActivityType(message: string): string | null {
  const v = normalizeForMatch(message);
  if (!v) return null;
  if (v.includes('startup')) return 'Startup';
  if (/(costituir|da costituire|da aprire|non ho attivita|devo aprire|devo avviare|voglio avviare|vorrei avviare|voglio aprire|vorrei aprire|sto avviando|sto aprendo|avviare|aprire attivita|avvio attivita|nuova attivita|non e ancora attiva|ancora non esiste|non l ho ancora aperta|devo aprirla)/.test(v)) return 'Da costituire';
  if (/(ho un impresa|ho una impresa|ho un azienda|ho una azienda|abbiamo un impresa|abbiamo una azienda|azienda attiva|impresa attiva|attivita attiva|attivita avviata|gia attiva|già attiva|gia esistente|già esistente|impresa agricola|azienda agricola|operativa|gia operativa|già operativa|attiva|esiste gia|esiste già|ho gia l azienda|ho già l azienda|siamo gia operativi|siamo già operativi|societa attiva|società attiva)/.test(v)) return 'PMI';
  if (v.includes('pmi') || v.includes('piccola') || v.includes('media impresa')) return 'PMI';
  if (v.includes('srl') || v.includes('s r l') || v.includes('spa') || v.includes('s p a') || v.includes('snc') || v.includes('s a s')) return 'PMI';
  if (v.includes('professionista') || v.includes('libero professionista') || v.includes('partita iva')) return 'Professionista';
  if (v.includes('associazione') || v.includes('ets') || v.includes('terzo settore') || v.includes('onlus')) return 'ETS/Associazione';
  return null;
}

export function extractSectorFromMessage(message: string): string | null {
  const raw = message.trim();
  if (raw.length < 3) return null;
  const n = normalizeForMatch(raw);
  const known = [
    { sector: 'agricoltura', hints: ['agricoltura', 'agricolo', 'agricola', 'agriturismo', 'agroalimentare', 'azienda agricola', 'impresa agricola', 'trasformazione alimentare', 'vivaio', 'coltivazione', 'allevamento', 'vitivinicolo', 'oleario'] },
    { sector: 'turismo', hints: ['turismo', 'turistica', 'turistico', 'ricettiva', 'ospitalita', 'hotel', 'b&b', 'b and b', 'bnb', 'b n b', 'beb', 'affittacamere', 'alberghiero', 'casa vacanze', 'struttura ricettiva', 'resort', 'ostello', 'campeggio'] },
    { sector: 'ristorazione', hints: ['ristorazione', 'ristorante', 'bar', 'pizzeria', 'food'] },
    { sector: 'commercio', hints: ['commercio', 'negozio', 'retail', 'ecommerce', 'e commerce'] },
    { sector: 'manifattura', hints: ['manifattura', 'industria', 'produzione', 'fabbrica'] },
    { sector: 'artigianato', hints: ['artigianato', 'artigiano', 'bottega'] },
    { sector: 'edilizia', hints: ['edilizia', 'edile', 'costruzioni', 'cantiere'] },
    { sector: 'pesca', hints: ['pesca', 'ittico', 'acquacoltura'] },
    { sector: 'logistica', hints: ['logistica', 'magazzino', 'supply chain'] },
    { sector: 'trasporti', hints: ['trasporti', 'autotrasporto', 'mobilita'] },
    { sector: 'ICT', hints: ['ict', 'software', 'saas', 'digitale', 'ai', 'intelligenza artificiale', 'cybersecurity', 'siti web', 'web'] },
    { sector: 'servizi', hints: ['servizi', 'consulenza', 'professionale'] },
    { sector: 'sanita', hints: ['sanita', 'sanitario', 'medico', 'healthcare'] },
    { sector: 'formazione', hints: ['formazione', 'didattica', 'academy'] },
    { sector: 'cultura', hints: ['cultura', 'museo', 'museale', 'spettacolo', 'arte'] },
    { sector: 'energia', hints: ['energia', 'energetico', 'fotovoltaico', 'rinnovabile', 'efficientamento'] },
    { sector: 'moda', hints: ['moda', 'fashion', 'abbigliamento'] },
    { sector: 'design', hints: ['design', 'arredo', 'interior'] },
  ];
  for (const entry of known) {
    if (entry.hints.some((hint) => ` ${n} `.includes(` ${normalizeForMatch(hint)} `))) return entry.sector;
  }
  const m = raw.match(/settore\s*[:\-]?\s*([^\n,;.]{3,80})/i);
  if (m?.[1]) return m[1].trim();
  return null;
}

export function extractFundingGoalFromMessage(message: string): string | null {
  const raw = message.trim();
  if (raw.length < 3) return null;
  const n = normalizeForMatch(raw);
  const hasConcreteSignal = /\b(macchinar|software|digitalizz|attrezzatur|impiant|ristruttur|assunzion|marketing|ecommerce|sito web|negozio|laboratorio|arredi|mezzi|furgon|veicol|autoimpiego|startup|agricol|agriturism|fotovolta|liquidit|stipendi|affitto|bollette|scorte|materie prime|utenze)\b/.test(n);
  const humanConsultantOnly = /\b(consulen|persona|umano|ricontatt|richiam|farmi chiam|telefon|parlare con)\b/.test(n) && !hasConcreteSignal;
  if (humanConsultantOnly) return null;
  const triggers = ['voglio', 'vorrei', 'mi serve', 'mi servono', 'devo', 'necessito', 'obiettivo', 'finanziare', 'acquistare', 'cercando', 'cerco', 'sia', 'siano'];
  const hit = triggers.find((t) => n.includes(t));
  if (hit) {
    const after = raw.slice(Math.max(0, raw.toLowerCase().indexOf(hit.split(' ')[0] ?? hit) + (hit.split(' ')[0] ?? hit).length));
    const cleaned = after.replace(/^[:\-–—\s]+/, '').trim();
    const isGenericFinancialTerm = /^(bando|bandi|contributo|contributi|fondo perduto|finanziamento|finanziamenti|agevolazione|agevolazioni|incentivo|incentivi|misura|misure)$/i.test(cleaned);
    if (cleaned.length >= 3 && !isGenericFinancialTerm) return cleaned.length > 180 ? `${cleaned.slice(0, 180).trim()}…` : cleaned;
  }
  const prefixMatch = n.match(/^(bando|bandi|contributo|contributi|agevolazione|agevolazioni|finanziamento|finanziamenti)\s+(per|su)\s+/);
  if (prefixMatch) {
    const startIdx = n.indexOf(prefixMatch[0]) + prefixMatch[0].length;
    const cleaned = raw.slice(startIdx).trim();
    if (cleaned.length > 5) return cleaned.length > 180 ? `${cleaned.slice(0, 180).trim()}…` : cleaned;
  }
  // SHORT MESSAGE HEURISTIC: if the message is very short (1-4 words) and contains
  // a concrete spending keyword, treat the whole message as a funding goal.
  // This handles cases like "srl, ristrutturazioni" where "ristrutturazioni" is a spending goal.
  const wordCount = raw.split(/[\s,;]+/).filter(Boolean).length;
  if (hasConcreteSignal && wordCount <= 4) {
    // Extract only the spending-related part (skip legal form tokens)
    const spendingPart = raw.split(/[,;]+/).map(s => s.trim()).filter(part => {
      const pn = normalizeForMatch(part);
      // Skip parts that are just legal forms
      return !/^(srl|srls|spa|snc|sas|ditta individuale|cooperativa|professionista)$/i.test(pn);
    }).join(', ').trim();
    if (spendingPart.length >= 3) return spendingPart;
  }
  if (hasConcreteSignal && wordCount >= 3) return raw.length > 180 ? `${raw.slice(0, 180).trim()}…` : raw;
  return null;
}

export function parseFoundationYear(message: string): number | null {
  const norm = normalizeForMatch(message);
  if (!norm) return null;
  
  const currentYear = new Date().getFullYear();

  // Look for year patterns: 19XX or 20XX
  // Context: "nata nel 2020", "fondata nel 1995", "dal 2018"
  const yearMatch = message.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
      const year = parseInt(yearMatch[0], 10);
      if (year > 1900 && year <= currentYear) {
        // Check for "seniority" context to avoid false positives 
        const hasContext = /(fondat|nat|costituit|aperta|aperto|attiv|iscrizion|registro|dal\s+(19|20)\d{2}|anno\s+(19|20)\d{2}|creata)/i.test(norm);
        if (hasContext || year < currentYear - 100) return year; // 100 years old is definitively a company, not a founder
      }
  }

  // Handle "l'azienda ha 5 anni" 
  const relativeAgeMatch = message.match(/(?:azienda|societ|ditta|impresa|attivita|negozio)\s+(?:ha\s+)?(\d{1,3})\s+anni/i);
  if (relativeAgeMatch) {
      const yearsAgo = parseInt(relativeAgeMatch[1], 10);
      return Math.max(1900, currentYear - yearsAgo);
  }
  
  return null;
}

export function parseAnnualTurnover(message: string): number | null {
  const norm = normalizeForMatch(message);
  if (!norm) return null;
  // Look for turnover keywords: fatturato, ricavi, volume d'affari
  const hasTurnoverContext = /(fatturat|ricav|volume d affari|fatturiam|incass|bilanci)/.test(norm);
  if (!hasTurnoverContext) return null;
  
  const lowered = message.toLowerCase().replace(/\s+/g, ' ').trim();
  const m = lowered.match(/(\d+(?:[.,]\d+)?)(?:\s*)(k|m|mila|milioni|milione)?/i);
  if (!m) return null;
  
  const rawNum = m[1]!.replace(/\./g, '').replace(',', '.');
  const base = Number.parseFloat(rawNum);
  if (!Number.isFinite(base) || base < 0) return null;

  const mult = (m[2] ?? '').toLowerCase();
  if (mult === 'k' || mult === 'mila') return Math.round(base * 1000);
  if (mult === 'm' || mult === 'milione' || mult === 'milioni') return Math.round(base * 1_000_000);
  
  return base >= 1000 ? Math.round(base) : null;
}

export function parseIsInnovative(message: string): boolean | null {
  const norm = normalizeForMatch(message);
  if (!norm) return null;
  if (/(startup innovativ|pmi innovativ|registro special|sezione special|sezione innovativ)/.test(norm)) {
    // Check for negation
    if (/(non siamo|non sono|senza|non iscritt)/.test(norm)) return false;
    return true;
  }
  return null;
}

export function parseContributionPreference(message: string): ContributionPreference | null {
  const n = normalizeForMatch(message);
  if (!n) return null;
  if (n.includes('fondo perduto')) return 'fondo_perduto';
  if (n.includes('agevolato') || n.includes('finanziamento')) return 'finanziamento_agevolato';
  if (n.includes('credito imposta') || n.includes('credito d imposta')) return 'credito_imposta';
  if (n.includes('voucher')) return 'voucher';
  if (n.includes('entrambi') || n.includes('misto') || n.includes('tutti')) return 'misto';
  if (n.includes('non importa') || n.includes('qualsiasi')) return 'non_importa';
  return null;
}

export function extractAtecoFromMessage(message: string): string | null {
  const raw = message ?? '';
  const norm = normalizeForMatch(raw);
  const hasAtecoKeyword = norm.includes('ateco') || norm.includes('codice ateco') || norm.includes('codice attivita') || norm.includes('cod attivita');
  const idx = norm.indexOf('ateco');
  const window = idx >= 0 ? raw.slice(Math.max(0, idx - 120), Math.min(raw.length, idx + 220)) : raw;
  const dotted = /\b(\d{2})\.(\d{1,2})(?:\.(\d{1,2}))?\b/;
  const m = window.match(dotted) ?? (hasAtecoKeyword ? window.match(/\b(\d{2})(?:\.(\d{1,2}))?(?:\.(\d{1,2}))?\b/) : null);
  if (!m) return null;
  const a = m[1];
  const b = m[2];
  const c = m[3];
  if (a && b && c) return `${a}.${b.padStart(2, '0')}.${c.padStart(2, '0')}`;
  if (a && b) return `${a}.${b.padStart(2, '0')}`;
  return a ?? null;
}

/**
 * Extract profile updates from a user message.
 * Returns partial updates and slot sources for merging with existing profile.
 */
export function extractProfileFromMessage(message: string): ExtractedProfile {
  const updates: Partial<UserProfile> = {};
  const slotSource: Record<string, 'explicit' | 'demonym' | 'inferred'> = {};

  const detectedRegionSignal = detectRegionSignal(message);
  const detectedRegion = detectedRegionSignal?.region ?? null;
  const isStatingLocation = userIsStatingOwnLocation(message);

  if (detectedRegion) {
    updates.location = { region: detectedRegion, municipality: null };
    const isHighConfidence = (detectedRegionSignal as any).isHighConfidence === true;
    updates.locationNeedsConfirmation = !isStatingLocation && !isHighConfidence;
    slotSource.location = detectedRegionSignal?.source ?? 'explicit';
  }

  const explicitBudget = parseBudgetEUR(message);
  if (explicitBudget !== null) {
    updates.revenueOrBudgetEUR = explicitBudget;
    updates.budgetAnswered = true;
    slotSource.budget = 'explicit';
  }

  const explicitContribution = parseRequestedContributionEUR(message);
  if (explicitContribution !== null) {
    updates.requestedContributionEUR = explicitContribution;
    slotSource.requestedContributionEUR = 'explicit';
  }

  const explicitEmployees = parseEmployees(message);
  if (explicitEmployees !== null) {
    updates.employees = explicitEmployees;
    slotSource.employees = 'explicit';
  }

  const explicitBusinessExists = parseBusinessExistsFromMessage(message);
  if (explicitBusinessExists !== null) {
    updates.businessExists = explicitBusinessExists;
    slotSource.businessExists = 'explicit';
  }

  const explicitAge = parseAge(message);
  if (explicitAge !== null) {
    updates.age = explicitAge;
    slotSource.age = 'explicit';
  }

  const explicitAgeBand = parseAgeBand(message);
  if (explicitAgeBand !== null) {
    updates.ageBand = explicitAgeBand;
    slotSource.ageBand = 'explicit';
  }

  const explicitEmploymentStatus = parseEmploymentStatus(message);
  if (explicitEmploymentStatus !== null) {
    updates.employmentStatus = explicitEmploymentStatus;
    slotSource.employmentStatus = 'explicit';
  }

  const explicitLegalForm = parseLegalForm(message);
  if (explicitLegalForm !== null) {
    updates.legalForm = explicitLegalForm;
    slotSource.legalForm = 'explicit';
  }

  const explicitEmail = parseEmail(message);
  if (explicitEmail) {
    updates.contactEmail = explicitEmail;
    slotSource.contactEmail = 'explicit';
  }

  const explicitPhone = parsePhone(message);
  if (explicitPhone) {
    updates.contactPhone = explicitPhone;
    slotSource.contactPhone = 'explicit';
  }

  const explicitActivityType = parseActivityType(message);
  if (explicitActivityType) {
    updates.activityType = explicitActivityType;
    slotSource.activityType = 'explicit';
  }

  const explicitSector = extractSectorFromMessage(message);
  if (explicitSector) {
    updates.sector = explicitSector;
    slotSource.sector = 'explicit';
  }

  const explicitFundingGoal = extractFundingGoalFromMessage(message);
  if (explicitFundingGoal) {
    updates.fundingGoal = explicitFundingGoal;
    slotSource.fundingGoal = 'explicit';
  }

  const explicitContributionPref = parseContributionPreference(message);
  if (explicitContributionPref) {
    updates.contributionPreference = explicitContributionPref;
    slotSource.contributionPreference = 'explicit';
  }

  const explicitAteco = extractAtecoFromMessage(message);
  if (explicitAteco) {
    updates.ateco = explicitAteco;
    updates.atecoAnswered = true;
    slotSource.ateco = 'explicit';
  }

  const explicitFoundation = parseFoundationYear(message);
  if (explicitFoundation !== null) {
    updates.foundationYear = explicitFoundation;
    slotSource.foundationYear = 'explicit';
  }

  const explicitTurnover = parseAnnualTurnover(message);
  if (explicitTurnover !== null) {
    updates.annualTurnover = explicitTurnover;
    slotSource.annualTurnover = 'explicit';
  }

  const explicitInnovative = parseIsInnovative(message);
  if (explicitInnovative !== null) {
    updates.isInnovative = explicitInnovative;
    slotSource.isInnovative = 'explicit';
  }

  return { updates, slotSource };
}
