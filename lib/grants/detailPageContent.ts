import { createHash } from 'crypto';
import type { GrantDetailRecord, GrantExplainabilityRecord } from '@/lib/grants/details';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export type GrantDetailSectionId =
  | 'cosa_prevede'
  | 'target_reale'
  | 'cosa_si_ottiene'
  | 'spese_ammissibili'
  | 'spese_non_ammissibili'
  | 'requisiti_condizioni'
  | 'iter_domanda'
  | 'documenti'
  | 'esempi'
  | 'errori_frequenti'
  | 'sintesi_finale'
  | 'fonti_ufficiali';

export type GrantDetailSectionBlockKind = 'official_facts' | 'bndo_explanation' | 'examples' | 'warnings';

export type GrantDetailSectionBlock = {
  kind: GrantDetailSectionBlockKind;
  title: string;
  items: string[];
};

export type GrantDetailSource = {
  label: string;
  location: string;
  excerpt?: string;
  url?: string;
};

export type GrantDetailSectionPayload = {
  id: GrantDetailSectionId;
  title: string;
  summary: string;
  status: 'grounded' | 'partial';
  blocks: GrantDetailSectionBlock[];
  sources: GrantDetailSource[];
};

export type GrantDetailContentPayload = {
  schemaVersion: 'grant_detail_content_v1';
  generationVersion: string;
  generatedAt: string;
  sourceFingerprint: string;
  completenessScore: number;
  warnings: string[];
  sections: GrantDetailSectionPayload[];
};

type EconomicFacts = {
  grantMin: number | null;
  grantMax: number | null;
  costMin: number | null;
  costMax: number | null;
  coverageMin: number | null;
  coverageMax: number | null;
  displayAmountLabel: string | null;
  displayProjectAmountLabel: string | null;
  displayCoverageLabel: string | null;
};

type AggregatedFacts = {
  beneficiaries: string[];
  sectors: string[];
  excludedSectors: string[];
  territory: {
    regions: string[];
    provinces: string[];
    municipalities: string[];
  };
  aidForm: string | null;
  aidIntensity: string | null;
  authority: string | null;
  openingDate: string | null;
  deadlineDate: string | null;
  availabilityStatus: 'open' | 'incoming';
  conciseDescription: string | null;
  financedExpenses: string[];
  excludedExpenses: string[];
  hardRequirements: string[];
  applySteps: string[];
  likelyDocuments: string[];
  explainabilityMissing: string[];
  explainabilitySatisfied: string[];
  officialUrl: string;
  officialAttachments: string[];
  economic: EconomicFacts;
};

type PersistedRow = {
  grant_id: string;
  source_fingerprint: string;
  generation_version: string;
  content: unknown;
};

const GENERATION_VERSION = 'grant_detail_content_v1_2026_04_09_clean';
const MEMORY_TTL_MS = 15 * 60 * 1000;

const memoryCache = new Map<string, { expiresAt: number; sourceFingerprint: string; payload: GrantDetailContentPayload }>();

const PLACEHOLDER_PATTERNS = ['n/d', 'non disponibile', 'in aggiornamento', 'da verificare', 'non indicato'];
const NOISY_LABEL_PREFIXES = [
  /^cos['’` ]*e\b/,
  /^cosa prevede\b/,
  /^a chi si rivolge\b/,
  /^spese ammissibili\b/,
  /^voci ammesse\b/,
  /^dove serve attenzione\b/,
  /^panoramica rapida\b/,
  /^sintesi finale\b/,
];

const ITALIAN_REGIONS = [
  'Abruzzo',
  'Basilicata',
  'Calabria',
  'Campania',
  'Emilia-Romagna',
  'Friuli-Venezia Giulia',
  'Lazio',
  'Liguria',
  'Lombardia',
  'Marche',
  'Molise',
  'Piemonte',
  'Puglia',
  'Sardegna',
  'Sicilia',
  'Toscana',
  'Trentino-Alto Adige',
  "Valle d'Aosta",
  'Veneto',
] as const;

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeToken(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueList(values: Array<string | null | undefined>, limit = 10): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!value) continue;
    const key = normalizeText(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

function getNestedValue(root: unknown, path: string[]): unknown {
  let cursor: unknown = root;
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

function extractStructuredList(root: unknown, paths: string[][], limit = 8): string[] {
  const values: string[] = [];
  for (const path of paths) {
    const node = getNestedValue(root, path);
    if (Array.isArray(node)) {
      for (const item of node) {
        const line = String(item ?? '').trim();
        if (line) values.push(line);
      }
      continue;
    }
    if (typeof node === 'string') {
      const chunks = node
        .split(/[;,•·]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
      values.push(...chunks);
    }
  }
  return uniqueList(values, limit);
}

function flattenObjectText(input: unknown, output: string[], depth = 0) {
  if (depth > 4 || input === null || input === undefined) return;
  if (typeof input === 'string') {
    const text = input.replace(/\s+/g, ' ').trim();
    if (text) output.push(text);
    return;
  }
  if (Array.isArray(input)) {
    for (const item of input) flattenObjectText(item, output, depth + 1);
    return;
  }
  if (typeof input === 'object') {
    for (const value of Object.values(input as Record<string, unknown>)) {
      flattenObjectText(value, output, depth + 1);
    }
  }
}

function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/€/g, '').replace(/\s+/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parsePercentCandidates(value: string): number[] {
  return Array.from(value.matchAll(/(\d{1,3}(?:[.,]\d+)?)\s*%/g))
    .map((match) => Number(match[1].replace(',', '.')))
    .filter((num) => Number.isFinite(num) && num > 0 && num <= 100);
}

function formatCurrency(value: number): string {
  return `€ ${Math.round(value).toLocaleString('it-IT')}`;
}

function formatMoneyRange(min: number | null, max: number | null): string | null {
  const low = min !== null && Number.isFinite(min) && min > 0 ? min : null;
  const high = max !== null && Number.isFinite(max) && max > 0 ? max : null;
  if (low !== null && high !== null) {
    const a = Math.min(low, high);
    const b = Math.max(low, high);
    if (Math.abs(a - b) < 1) return formatCurrency(a);
    return `Da ${formatCurrency(a)} a ${formatCurrency(b)}`;
  }
  if (high !== null) return `Fino a ${formatCurrency(high)}`;
  if (low !== null) return `Da ${formatCurrency(low)}`;
  return null;
}

function formatPercentRange(min: number | null, max: number | null): string | null {
  const low = min !== null && Number.isFinite(min) ? Math.max(1, Math.min(100, min)) : null;
  const high = max !== null && Number.isFinite(max) ? Math.max(1, Math.min(100, max)) : null;
  if (low !== null && high !== null) {
    const a = Math.round(Math.min(low, high));
    const b = Math.round(Math.max(low, high));
    return a === b ? `${a}%` : `${a}% - ${b}%`;
  }
  if (high !== null) return `${Math.round(high)}%`;
  if (low !== null) return `${Math.round(low)}%`;
  return null;
}

function stripHtml(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractConciseDescription(description: string | null | undefined): string | null {
  const clean = stripHtml(description);
  if (!clean) return null;
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!sentences.length) return null;
  const relevant = sentences.filter((sentence) =>
    /(finanzia|sostiene|copre|agevola|beneficiar|imprese|professionisti|progett|investiment|spes[ae])/i.test(normalizeText(sentence)),
  );
  const picked = (relevant.length ? relevant : sentences).slice(0, 2).join(' ');
  return picked || clean.slice(0, 220);
}

function isPlaceholderValue(value: string | null | undefined): boolean {
  if (!value) return true;
  const norm = normalizeText(value);
  if (!norm) return true;
  return PLACEHOLDER_PATTERNS.some((token) => norm.includes(token));
}

function cleanLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || isPlaceholderValue(trimmed)) return null;
  return trimmed;
}

function sentenceCase(value: string): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return trimmed;
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function extractKeywordSentences(description: string | null | undefined, regex: RegExp, limit = 4): string[] {
  const clean = stripHtml(description);
  if (!clean) return [];
  const lines = clean
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => regex.test(normalizeText(line)))
    .map((line) => sanitizeGeneratedLine(line))
    .filter((line): line is string => Boolean(line));
  return uniqueList(lines.map(sentenceCase), limit);
}

function hasNegativeHint(value: string): boolean {
  return /(non ammiss|non finanzi|esclus|inammiss|vietat|non consentit|incompatibil)/.test(normalizeText(value));
}

function extractDocumentHints(description: string | null | undefined): string[] {
  const norm = normalizeText(stripHtml(description));
  if (!norm) return [];
  const hints: string[] = [];
  const add = (condition: boolean, label: string) => {
    if (condition) hints.push(label);
  };

  add(/documento identita|carta identita|passaporto/.test(norm), "Documento d'identità");
  add(/codice fiscale/.test(norm), 'Codice fiscale');
  add(/visura camerale|camera di commercio|cciaa/.test(norm), 'Visura camerale aggiornata');
  add(/bilancio|dichiarazion[ei] fiscali|modello unico/.test(norm), 'Bilanci o dichiarazioni fiscali');
  add(/business plan|piano d.?impresa|piano economico/.test(norm), 'Business plan / piano economico');
  add(/preventiv|offert[ae] fornitor/.test(norm), 'Preventivi di spesa');
  add(/durc/.test(norm), 'DURC in corso di validità');
  add(/atto costitutivo|statuto/.test(norm), 'Atto costitutivo / statuto');
  add(/firma digitale/.test(norm), 'Firma digitale');
  add(/pec/.test(norm), 'Indirizzo PEC');

  return uniqueList(hints, 8);
}

function sanitizeGeneratedLine(value: string): string | null {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  const noBullet = trimmed.replace(/^[•\-–\d.)\s]+/, '').trim();
  if (!noBullet) return null;
  const normalized = normalizeText(noBullet).replace(/[:;]/g, '');
  if (!normalized) return null;
  if (NOISY_LABEL_PREFIXES.some((pattern) => pattern.test(normalized))) return null;
  if (normalized.length < 12) return null;
  if (normalized === 'non e specificato nella fonte ufficiale') return null;
  return noBullet;
}

function sanitizeGeneratedList(values: string[], limit = 10): string[] {
  const cleaned = values
    .map((item) => sanitizeGeneratedLine(item))
    .filter((item): item is string => Boolean(item))
    .map((item) => sentenceCase(item.endsWith('.') ? item : `${item}.`));
  return uniqueList(cleaned, limit);
}

function extractRegionsFromText(value: string): string[] {
  const norm = normalizeToken(value);
  if (!norm) return [];
  const found: string[] = [];
  for (const region of ITALIAN_REGIONS) {
    const token = normalizeToken(region);
    if (!token) continue;
    const pattern = new RegExp(`(^|\\s)${escapeRegex(token)}(\\s|$)`);
    if (pattern.test(norm)) found.push(region);
  }
  return uniqueList(found, 6);
}

function computeEconomicFacts(detail: GrantDetailRecord): EconomicFacts {
  const structured =
    detail.requisitiStrutturati && typeof detail.requisitiStrutturati === 'object'
      ? ((detail.requisitiStrutturati.economic as Record<string, unknown> | undefined) ?? undefined)
      : undefined;

  const grantMin = parseNumeric(structured?.grantMin);
  const grantMax = parseNumeric(structured?.grantMax);
  const costMin = parseNumeric(structured?.costMin);
  const costMax = parseNumeric(structured?.costMax);

  const directCoverageMin = parseNumeric(structured?.estimatedCoverageMinPercent);
  const directCoverageMax = parseNumeric(structured?.estimatedCoverageMaxPercent);
  let coverageMin = directCoverageMin;
  let coverageMax = directCoverageMax;

  if (coverageMin === null || coverageMax === null) {
    const source = [cleanLabel(structured?.displayCoverageLabel), cleanLabel(detail.aidIntensity), stripHtml(detail.description)]
      .filter(Boolean)
      .join(' ');
    const percentCandidates = parsePercentCandidates(source);
    if (percentCandidates.length > 0) {
      coverageMin = Math.min(...percentCandidates);
      coverageMax = Math.max(...percentCandidates);
    }
  }

  return {
    grantMin,
    grantMax,
    costMin,
    costMax,
    coverageMin,
    coverageMax,
    displayAmountLabel: cleanLabel(structured?.displayAmountLabel),
    displayProjectAmountLabel: cleanLabel(structured?.displayProjectAmountLabel),
    displayCoverageLabel: cleanLabel(structured?.displayCoverageLabel),
  };
}

function aggregateFacts(detail: GrantDetailRecord, explainability: GrantExplainabilityRecord): AggregatedFacts {
  const corpusRaw: string[] = [];
  flattenObjectText(detail.requisitiStrutturati, corpusRaw);
  flattenObjectText(detail.requisitiHard, corpusRaw);
  flattenObjectText(detail.requisitiSoft, corpusRaw);
  const corpus = uniqueList(corpusRaw, 80);

  const structuredTerritory =
    detail.requisitiStrutturati && typeof detail.requisitiStrutturati === 'object'
      ? ((detail.requisitiStrutturati.territory as Record<string, unknown> | undefined) ?? undefined)
      : undefined;

  const regions = uniqueList(
    [
      ...extractStructuredList(structuredTerritory, [['regions'], ['regioni']], 8),
      ...extractRegionsFromText(`${detail.title} ${detail.authority ?? ''}`),
    ],
    8,
  );

  const financedExpenses = sanitizeGeneratedList(
    [
      ...extractStructuredList(
        detail.requisitiStrutturati,
        [
          ['expenses', 'admitted'],
          ['expenses', 'eligible'],
          ['economic', 'eligibleCosts'],
          ['economic', 'admittedCosts'],
          ['summary', 'whatFinances'],
        ],
        10,
      ),
      ...extractKeywordSentences(
        detail.description,
        /(finanzia|ammissibil|copre|contribut|voucher|investiment|spes[ae]|macchinar|consulenz|software|impiant|digital)/,
        6,
      ),
    ],
    10,
  );

  const excludedExpenses = sanitizeGeneratedList(
    [
      ...extractStructuredList(
        detail.requisitiStrutturati,
        [
          ['expenses', 'excluded'],
          ['expenses', 'notAdmitted'],
          ['summary', 'whatExcludes'],
          ['constraints', 'excludedConditions'],
        ],
        10,
      ),
      ...extractKeywordSentences(
        detail.description,
        /(non ammiss|non finanzi|esclus|inammiss|vietat|non consentit|incompatibil|non copre)/,
        6,
      ),
      ...corpus.filter((line) => hasNegativeHint(line)),
    ],
    10,
  );

  const hardRequirements = sanitizeGeneratedList(
    [
      ...extractStructuredList(
        detail.requisitiStrutturati,
        [
          ['requirements', 'hard'],
          ['requirements', 'mandatory'],
          ['summary', 'keyRequirements'],
          ['constraints', 'mustHave'],
        ],
        10,
      ),
      ...extractStructuredList(detail.requisitiHard, [['requirements'], ['vincoli'], ['requisiti']], 8),
      ...explainability.missingRequirements,
    ],
    12,
  );

  const likelyDocuments = sanitizeGeneratedList(
    [
      ...(detail.requiredDocuments ?? []),
      ...extractStructuredList(
        detail.requisitiStrutturati,
        [
          ['documents', 'required'],
          ['documents', 'base'],
          ['summary', 'likelyDocuments'],
        ],
        8,
      ),
      ...extractDocumentHints(detail.description),
    ],
    10,
  );

  const applySteps = sanitizeGeneratedList(
    [
      ...explainability.applySteps,
      ...extractStructuredList(detail.requisitiStrutturati, [['application', 'steps'], ['procedure', 'steps']], 6),
    ],
    8,
  );

  return {
    beneficiaries: uniqueList(detail.beneficiaries, 8),
    sectors: uniqueList(detail.sectors, 8),
    excludedSectors: uniqueList(extractStructuredList(detail.requisitiHard, [['settori_esclusi']], 8), 8),
    territory: {
      regions,
      provinces: uniqueList(extractStructuredList(structuredTerritory, [['provinces'], ['province']], 8), 8),
      municipalities: uniqueList(extractStructuredList(structuredTerritory, [['municipalities'], ['comuni']], 8), 8),
    },
    aidForm: cleanLabel(detail.aidForm),
    aidIntensity: cleanLabel(detail.aidIntensity),
    authority: cleanLabel(detail.authority),
    openingDate: detail.openingDate,
    deadlineDate: detail.deadlineDate,
    availabilityStatus: detail.availabilityStatus,
    conciseDescription: extractConciseDescription(detail.description),
    financedExpenses,
    excludedExpenses,
    hardRequirements,
    applySteps,
    likelyDocuments,
    explainabilityMissing: uniqueList(explainability.missingRequirements, 8),
    explainabilitySatisfied: uniqueList(explainability.satisfiedRequirements, 8),
    officialUrl: detail.officialUrl,
    officialAttachments: uniqueList(detail.officialAttachments, 8),
    economic: computeEconomicFacts(detail),
  };
}

function territorySummary(facts: AggregatedFacts): string {
  const parts: string[] = [];
  if (facts.territory.municipalities.length > 0) {
    parts.push(`comuni: ${facts.territory.municipalities.slice(0, 4).join(', ')}`);
  }
  if (facts.territory.provinces.length > 0) {
    parts.push(`province: ${facts.territory.provinces.slice(0, 4).join(', ')}`);
  }
  if (facts.territory.regions.length > 0) {
    parts.push(`regioni: ${facts.territory.regions.slice(0, 4).join(', ')}`);
  }
  if (!parts.length) return 'territorio non esplicitato chiaramente nella scheda disponibile';
  return parts.join(' · ');
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('it-IT');
}

function isSectionGrounded(section: GrantDetailSectionPayload): boolean {
  return section.blocks.some((block) => block.kind === 'official_facts' && block.items.length > 0);
}

function buildSections(detail: GrantDetailRecord, explainability: GrantExplainabilityRecord): GrantDetailSectionPayload[] {
  const facts = aggregateFacts(detail, explainability);
  const territoryLabel = territorySummary(facts);
  const economicCoverage =
    facts.economic.displayCoverageLabel || formatPercentRange(facts.economic.coverageMin, facts.economic.coverageMax);
  const economicGrant = facts.economic.displayAmountLabel || formatMoneyRange(facts.economic.grantMin, facts.economic.grantMax);
  const economicProject =
    facts.economic.displayProjectAmountLabel || formatMoneyRange(facts.economic.costMin, facts.economic.costMax);

  const sections: GrantDetailSectionPayload[] = [
    {
      id: 'cosa_prevede',
      title: 'Cosa prevede il bando',
      summary: facts.conciseDescription || 'Sintesi operativa della misura con focus su finalità e funzionamento reale.',
      status: 'grounded',
      blocks: [
        {
          kind: 'official_facts',
          title: 'Dati ufficiali',
          items: uniqueList(
            [
              facts.aidForm ? `Forma di agevolazione: ${facts.aidForm}.` : null,
              facts.aidIntensity ? `Intensità indicata in scheda: ${facts.aidIntensity}.` : null,
              facts.conciseDescription ? sentenceCase(facts.conciseDescription) : null,
            ],
            4,
          ),
        },
        {
          kind: 'bndo_explanation',
          title: 'Lettura pratica BNDO',
          items: [
            'Questa sezione serve a capire se la misura è davvero adatta al tuo caso prima di preparare la domanda.',
            `Il bando è gestito da ${facts.authority || 'ente indicato in scheda'} e conviene leggerlo insieme ai dettagli operativi riportati nelle sezioni successive.`,
          ],
        },
      ],
      sources: [
        {
          label: 'Scheda bando',
          location: 'detail.title/detail.description/detail.aidForm',
          url: facts.officialUrl,
        },
      ],
    },
    {
      id: 'target_reale',
      title: 'A chi si rivolge',
      summary: 'Profili ideali, casi compatibili e situazioni spesso non in linea.',
      status: 'grounded',
      blocks: [
        {
          kind: 'official_facts',
          title: 'Beneficiari e campo di applicazione',
          items: uniqueList(
            [
              facts.beneficiaries.length
                ? `Beneficiari indicati: ${facts.beneficiaries.slice(0, 5).join(', ')}.`
                : 'Non è specificato nella fonte ufficiale quali sono i beneficiari ammessi.',
              facts.sectors.length ? `Settori citati: ${facts.sectors.slice(0, 5).join(', ')}.` : null,
              `Vincolo territoriale: ${territoryLabel}.`,
            ],
            5,
          ),
        },
        {
          kind: 'bndo_explanation',
          title: 'Come orientarti subito',
          items: uniqueList(
            [
              facts.explainabilitySatisfied[0]
                ? sentenceCase(`${facts.explainabilitySatisfied[0]}.`)
                : 'Se il tuo profilo rientra nei beneficiari principali, la misura è potenzialmente adatta.',
              facts.explainabilityMissing[0]
                ? `Spesso non è in linea chi non supera questo requisito: ${sentenceCase(facts.explainabilityMissing[0])}.`
                : 'Chi non rientra in forma giuridica, territorio o settore rischia di non essere ammissibile.',
            ],
            4,
          ),
        },
      ],
      sources: [
        {
          label: 'Beneficiari in scheda',
          location: 'detail.beneficiaries/requisitiStrutturati.requirements',
          excerpt: facts.beneficiaries.join(', '),
          url: facts.officialUrl,
        },
      ],
    },
    {
      id: 'cosa_si_ottiene',
      title: 'Cosa si può ottenere',
      summary: 'Forma del beneficio, intensità economica e soglie realmente disponibili.',
      status: economicCoverage || economicGrant || economicProject ? 'grounded' : 'partial',
      blocks: [
        {
          kind: 'official_facts',
          title: 'Struttura economica',
          items: uniqueList(
            [
              facts.aidForm ? `Tipologia aiuto: ${facts.aidForm}.` : null,
              economicCoverage ? `Copertura indicata: ${economicCoverage}.` : null,
              economicGrant ? `Contributo/agevolazione stimata: ${economicGrant}.` : null,
              economicProject ? `Importo progetto ammissibile: ${economicProject}.` : null,
              !economicCoverage && !economicGrant && !economicProject
                ? 'Non è specificato nella fonte ufficiale un quadro economico completo.'
                : null,
            ],
            5,
          ),
        },
      ],
      sources: [
        {
          label: 'Dati economici',
          location: 'detail.requisitiStrutturati.economic/detail.aidIntensity',
          excerpt: [economicCoverage, economicGrant, economicProject].filter(Boolean).join(' · ') || undefined,
          url: facts.officialUrl,
        },
      ],
    },
    {
      id: 'spese_ammissibili',
      title: 'Spese ammissibili',
      summary: 'Voci finanziabili raggruppate in modo operativo.',
      status: facts.financedExpenses.length > 0 ? 'grounded' : 'partial',
      blocks: [
        {
          kind: 'official_facts',
          title: 'Voci ammesse',
          items:
            facts.financedExpenses.length > 0
              ? facts.financedExpenses.slice(0, 8)
              : ['Non è specificato nella fonte ufficiale quali spese sono ammissibili.'],
        },
        {
          kind: 'bndo_explanation',
          title: 'Come usarle nella pratica',
          items: [
            'Prepara preventivi coerenti con le voci ammesse e collega ogni costo a un obiettivo concreto del progetto.',
            'Evita di inserire spese borderline senza giustificazione tecnica o temporale.',
          ],
        },
      ],
      sources: [
        {
          label: 'Spese ammesse',
          location: 'requisitiStrutturati.expenses/detail.description',
          excerpt: facts.financedExpenses.slice(0, 2).join(' · ') || undefined,
          url: facts.officialUrl,
        },
      ],
    },
    {
      id: 'spese_non_ammissibili',
      title: 'Spese non ammissibili e limiti importanti',
      summary: 'Esclusioni, incompatibilità e limiti da controllare prima della domanda.',
      status: facts.excludedExpenses.length > 0 || facts.excludedSectors.length > 0 ? 'grounded' : 'partial',
      blocks: [
        {
          kind: 'official_facts',
          title: 'Esclusioni rilevate',
          items: uniqueList(
            [
              ...facts.excludedExpenses,
              facts.excludedSectors.length ? `Settori esclusi: ${facts.excludedSectors.join(', ')}.` : null,
              facts.excludedExpenses.length === 0 && facts.excludedSectors.length === 0
                ? 'Non è specificato nella fonte ufficiale un elenco puntuale di esclusioni.'
                : null,
            ],
            8,
          ),
        },
        {
          kind: 'warnings',
          title: 'Rischi tipici',
          items: [
            'Molte domande vengono respinte perché includono spese non coerenti con le finalità o con i limiti temporali del bando.',
          ],
        },
      ],
      sources: [
        {
          label: 'Vincoli ed esclusioni',
          location: 'requisitiStrutturati.constraints/requisitiHard',
          excerpt: facts.excludedExpenses.slice(0, 2).join(' · ') || undefined,
          url: facts.officialUrl,
        },
      ],
    },
    {
      id: 'requisiti_condizioni',
      title: 'Requisiti e condizioni',
      summary: 'Condizioni soggettive e tecniche che incidono davvero sull’ammissibilità.',
      status: facts.hardRequirements.length > 0 ? 'grounded' : 'partial',
      blocks: [
        {
          kind: 'official_facts',
          title: 'Requisiti principali',
          items:
            facts.hardRequirements.length > 0
              ? facts.hardRequirements.slice(0, 8)
              : ['Non è specificato nella fonte ufficiale un elenco completo dei requisiti.'],
        },
        {
          kind: 'warnings',
          title: 'Cosa blocca più spesso la domanda',
          items:
            facts.explainabilityMissing.length > 0
              ? facts.explainabilityMissing.slice(0, 4).map((item) => sentenceCase(item.endsWith('.') ? item : `${item}.`))
              : ['In assenza di dati completi conviene verificare forma giuridica, sede, ATECO e stato aziendale prima dell’invio.'],
        },
      ],
      sources: [
        {
          label: 'Requisiti scheda',
          location: 'requisitiStrutturati.requirements/explainability.missingRequirements',
          excerpt: facts.hardRequirements.slice(0, 2).join(' · ') || undefined,
          url: facts.officialUrl,
        },
      ],
    },
    {
      id: 'iter_domanda',
      title: 'Come funziona la domanda',
      summary: 'Passaggi operativi, tempistiche e punti di controllo prima dell’invio.',
      status: facts.applySteps.length > 0 ? 'grounded' : 'partial',
      blocks: [
        {
          kind: 'official_facts',
          title: 'Procedura',
          items: uniqueList(
            [
              facts.applySteps.length > 0
                ? null
                : `Stato sportello: ${facts.availabilityStatus === 'incoming' ? 'in apertura' : 'aperto'}.`,
              ...facts.applySteps.map((item) => sentenceCase(item.endsWith('.') ? item : `${item}.`)),
              facts.openingDate ? `Data apertura: ${formatDate(facts.openingDate)}.` : null,
              facts.deadlineDate ? `Scadenza indicata: ${formatDate(facts.deadlineDate)}.` : 'Scadenza non chiaramente disponibile in scheda.',
              facts.applySteps.length === 0 ? 'Non è specificato nella fonte ufficiale l’iter completo di presentazione.' : null,
            ],
            8,
          ),
        },
        {
          kind: 'bndo_explanation',
          title: 'Operatività consigliata',
          items: [
            'Prima dell’invio, verifica coerenza tra progetto, preventivi e requisiti soggettivi per evitare integrazioni tardive.',
          ],
        },
      ],
      sources: [
        {
          label: 'Iter e scadenze',
          location: 'explainability.applySteps/detail.openingDate/detail.deadlineDate',
          url: facts.officialUrl,
        },
      ],
    },
    {
      id: 'documenti',
      title: 'Documenti da preparare',
      summary: 'Check operativo dei documenti più ricorrenti per partire senza ritardi.',
      status: facts.likelyDocuments.length > 0 ? 'grounded' : 'partial',
      blocks: [
        {
          kind: 'official_facts',
          title: 'Checklist documentale',
          items:
            facts.likelyDocuments.length > 0
              ? facts.likelyDocuments.slice(0, 9)
              : ['Non è specificato nella fonte ufficiale l’elenco documentale completo.'],
        },
        {
          kind: 'warnings',
          title: 'Per evitare blocchi in istruttoria',
          items: ['Controlla che i documenti siano aggiornati, firmati dove richiesto e coerenti con i dati inseriti in domanda.'],
        },
      ],
      sources: [
        {
          label: 'Documenti',
          location: 'detail.requiredDocuments/requisitiStrutturati.documents',
          excerpt: facts.likelyDocuments.slice(0, 2).join(' · ') || undefined,
          url: facts.officialUrl,
        },
      ],
    },
    {
      id: 'esempi',
      title: 'Esempi pratici o simulazioni',
      summary: 'Scenari qualitativi per capire velocemente quando la misura è in linea o no.',
      status: 'grounded',
      blocks: [
        {
          kind: 'examples',
          title: 'Simulazioni BNDO (non sostituiscono il testo ufficiale)',
          items: uniqueList(
            [
              `Esempio compatibile: ${facts.beneficiaries[0] || 'un soggetto beneficiario ammesso'} con progetto ${facts.sectors[0] ? `nel settore ${facts.sectors[0]}` : 'coerente con il bando'} e ${territoryLabel !== 'territorio non esplicitato chiaramente nella scheda disponibile' ? territoryLabel : 'localizzazione conforme ai vincoli territoriali'} ha buone probabilità di superare la pre-verifica.`,
              `Esempio a rischio: domanda con spese fuori perimetro${facts.excludedExpenses[0] ? ` (es. ${facts.excludedExpenses[0]})` : ''} o con requisito soggettivo non rispettato può essere esclusa anche con progetto valido.`,
            ],
            4,
          ),
        },
      ],
      sources: [
        {
          label: 'Simulazioni basate su requisiti',
          location: 'beneficiaries/sectors/requirements/exclusions',
          url: facts.officialUrl,
        },
      ],
    },
    {
      id: 'errori_frequenti',
      title: 'Errori frequenti / attenzione',
      summary: 'Gli errori che più spesso compromettono ammissibilità o tempi di approvazione.',
      status: 'grounded',
      blocks: [
        {
          kind: 'warnings',
          title: 'Da evitare',
          items: uniqueList(
            [
              ...facts.explainabilityMissing.slice(0, 4).map((item) => sentenceCase(item.endsWith('.') ? item : `${item}.`)),
              'Presentare spese non allineate alle finalità del bando o prive di giustificativi tecnici.',
              'Sottovalutare vincoli territoriali o tempistiche di apertura/chiusura sportello.',
            ],
            6,
          ),
        },
      ],
      sources: [
        {
          label: 'Criticità ricorrenti',
          location: 'explainability.missingRequirements/requisitiHard',
          excerpt: facts.explainabilityMissing.slice(0, 2).join(' · ') || undefined,
          url: facts.officialUrl,
        },
      ],
    },
    {
      id: 'sintesi_finale',
      title: 'Sintesi finale',
      summary: 'Conclusione operativa: per chi conviene e quali controlli fare prima di procedere.',
      status: 'grounded',
      blocks: [
        {
          kind: 'bndo_explanation',
          title: 'Valutazione sintetica',
          items: uniqueList(
            [
              `Conviene soprattutto a chi rientra nei beneficiari indicati (${facts.beneficiaries.slice(0, 3).join(', ') || 'beneficiari specifici del bando'}) e ha progetto coerente con spese ammissibili.`,
              facts.explainabilityMissing[0]
                ? `È meno adatto a chi non supera questo requisito chiave: ${sentenceCase(facts.explainabilityMissing[0])}.`
                : 'È meno adatto a chi non può rispettare i requisiti soggettivi, territoriali o settoriali.',
              'Prima di muoverti: verifica con precisione requisiti formali, documenti obbligatori e cronologia delle spese.',
            ],
            4,
          ),
        },
      ],
      sources: [
        {
          label: 'Sintesi BNDO',
          location: 'beneficiaries/explainability/requirements',
          url: facts.officialUrl,
        },
      ],
    },
    {
      id: 'fonti_ufficiali',
      title: 'Fonti ufficiali',
      summary: 'Link istituzionali da usare come riferimento definitivo prima dell’invio.',
      status: 'grounded',
      blocks: [
        {
          kind: 'official_facts',
          title: 'Riferimenti',
          items: uniqueList(
            [
              facts.officialUrl ? `Pagina ufficiale bando: ${facts.officialUrl}` : null,
              ...facts.officialAttachments.slice(0, 6).map((url, idx) => `Allegato ufficiale ${idx + 1}: ${url}`),
            ],
            8,
          ),
        },
        {
          kind: 'warnings',
          title: 'Nota affidabilità',
          items: ['In caso di discordanza, prevale sempre il testo ufficiale del bando e dei relativi allegati.'],
        },
      ],
      sources: [
        {
          label: 'Fonte istituzionale',
          location: 'detail.officialUrl/detail.officialAttachments',
          url: facts.officialUrl,
        },
      ],
    },
  ];

  return sections.map((section) => {
    const hasOfficialBlock = section.blocks.some((block) => block.kind === 'official_facts' && block.items.length > 0);
    return {
      ...section,
      status: hasOfficialBlock ? section.status : 'partial',
      blocks: section.blocks.filter((block) => block.items.length > 0),
    };
  });
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function computeGrantDetailSourceFingerprint(
  detail: GrantDetailRecord,
  explainability: GrantExplainabilityRecord,
): string {
  const base = {
    id: detail.id,
    title: detail.title,
    authority: detail.authority,
    openingDate: detail.openingDate,
    deadlineDate: detail.deadlineDate,
    availabilityStatus: detail.availabilityStatus,
    aidForm: detail.aidForm,
    aidIntensity: detail.aidIntensity,
    beneficiaries: detail.beneficiaries,
    sectors: detail.sectors,
    officialUrl: detail.officialUrl,
    officialAttachments: detail.officialAttachments,
    description: detail.description,
    requiredDocuments: detail.requiredDocuments ?? [],
    requisitiHard: detail.requisitiHard,
    requisitiSoft: detail.requisitiSoft,
    requisitiStrutturati: detail.requisitiStrutturati,
    explainability,
  };

  return createHash('sha256').update(stableStringify(base)).digest('hex');
}

function buildWarnings(sections: GrantDetailSectionPayload[]): string[] {
  const warnings: string[] = [];
  const partialSections = sections.filter((section) => section.status === 'partial');
  if (partialSections.length > 0) {
    warnings.push(`Non è specificato nella fonte ufficiale per: ${partialSections.map((section) => section.title).join(', ')}.`);
  }

  if (!sections.find((section) => section.id === 'fonti_ufficiali')?.blocks.some((block) => block.items.length > 0)) {
    warnings.push('Non è specificato nella fonte ufficiale un set completo di fonti o allegati.');
  }

  return warnings;
}

function composePayload(
  detail: GrantDetailRecord,
  explainability: GrantExplainabilityRecord,
  sourceFingerprint: string,
): GrantDetailContentPayload {
  const sections = buildSections(detail, explainability);
  const groundedCount = sections.filter(isSectionGrounded).length;
  const completenessScore = Math.round((groundedCount / Math.max(1, sections.length)) * 100);

  return {
    schemaVersion: 'grant_detail_content_v1',
    generationVersion: GENERATION_VERSION,
    generatedAt: new Date().toISOString(),
    sourceFingerprint,
    completenessScore,
    warnings: buildWarnings(sections),
    sections,
  };
}

function isValidBlock(value: unknown): value is GrantDetailSectionBlock {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.kind === 'string' &&
    typeof v.title === 'string' &&
    Array.isArray(v.items) &&
    v.items.every((item) => typeof item === 'string')
  );
}

function isValidSection(value: unknown): value is GrantDetailSectionPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    typeof v.summary === 'string' &&
    (v.status === 'grounded' || v.status === 'partial') &&
    Array.isArray(v.blocks) &&
    v.blocks.every(isValidBlock) &&
    Array.isArray(v.sources)
  );
}

export function isGrantDetailContentPayload(value: unknown): value is GrantDetailContentPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return (
    payload.schemaVersion === 'grant_detail_content_v1' &&
    typeof payload.generationVersion === 'string' &&
    typeof payload.generatedAt === 'string' &&
    typeof payload.sourceFingerprint === 'string' &&
    typeof payload.completenessScore === 'number' &&
    Array.isArray(payload.warnings) &&
    payload.warnings.every((item) => typeof item === 'string') &&
    Array.isArray(payload.sections) &&
    payload.sections.every(isValidSection)
  );
}

async function loadPersisted(grantId: string): Promise<PersistedRow | null> {
  try {
    const admin = getSupabaseAdmin() as any;
    const { data, error } = await admin
      .from('grant_detail_contents')
      .select('grant_id, source_fingerprint, generation_version, content')
      .eq('grant_id', grantId)
      .maybeSingle();

    if (error) {
      return null;
    }

    if (!data) return null;
    return data as PersistedRow;
  } catch {
    return null;
  }
}

async function persistPayload(grantId: string, payload: GrantDetailContentPayload): Promise<void> {
  try {
    const admin = getSupabaseAdmin() as any;
    await admin.from('grant_detail_contents').upsert(
      {
        grant_id: grantId,
        source_fingerprint: payload.sourceFingerprint,
        generation_version: payload.generationVersion,
        completeness_score: payload.completenessScore,
        content: payload,
        generated_at: payload.generatedAt,
        last_verified_at: payload.generatedAt,
      },
      { onConflict: 'grant_id' },
    );
  } catch {
    // Fail-open: if persistence is unavailable we still return deterministic payload.
  }
}

function readMemory(grantId: string, sourceFingerprint: string): GrantDetailContentPayload | null {
  const cached = memoryCache.get(grantId);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    memoryCache.delete(grantId);
    return null;
  }
  if (cached.sourceFingerprint !== sourceFingerprint) return null;
  return cached.payload;
}

function writeMemory(grantId: string, payload: GrantDetailContentPayload) {
  memoryCache.set(grantId, {
    sourceFingerprint: payload.sourceFingerprint,
    payload,
    expiresAt: Date.now() + MEMORY_TTL_MS,
  });
}

export async function getOrBuildGrantDetailContent(
  detail: GrantDetailRecord,
  explainability: GrantExplainabilityRecord,
): Promise<GrantDetailContentPayload> {
  const grantId = String(detail.id || '').trim();
  if (!grantId) {
    return composePayload(detail, explainability, 'no-grant-id');
  }

  const sourceFingerprint = computeGrantDetailSourceFingerprint(detail, explainability);

  const cached = readMemory(grantId, sourceFingerprint);
  if (cached) return cached;

  const persisted = await loadPersisted(grantId);
  if (
    persisted &&
    persisted.source_fingerprint === sourceFingerprint &&
    persisted.generation_version === GENERATION_VERSION &&
    isGrantDetailContentPayload(persisted.content)
  ) {
    writeMemory(grantId, persisted.content);
    return persisted.content;
  }

  const payload = composePayload(detail, explainability, sourceFingerprint);
  writeMemory(grantId, payload);
  await persistPayload(grantId, payload);
  return payload;
}
