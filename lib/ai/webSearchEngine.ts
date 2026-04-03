import { INCENTIVI_SOLR_ENDPOINT } from '@/lib/matching/fetchIncentiviShared';

export type SearchSourceTier = 'official' | 'authoritative' | 'web';

export interface SearchResult {
  title: string;
  url: string;
  evidenceSnippet: string;
  sourceTier: SearchSourceTier;
  publishedAt: string | null;
}

export type SearchOutcome = {
  ok: boolean;
  query: string;
  results: SearchResult[];
  providersUsed: string[];
  warning?: string;
  unavailableReason?: string;
};

type SerperOrganicResult = {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
};

type IncentiviDoc = {
  title?: string;
  authorityName?: string;
  openDate?: string;
  closeDate?: string;
  updatedAt?: string;
  institutionalLink?: string;
  url?: string;
  description?: string;
  score?: number;
};

const SERPER_ENDPOINT = 'https://google.serper.dev/search';
const DDG_HTML_ENDPOINT = 'https://html.duckduckgo.com/html/';
const MAX_RESULTS = 8;
const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FORBIDDEN_PROMPT_TOKENS = [
  'ignore previous instructions',
  'ignore all previous',
  'system prompt',
  'developer message',
  'jailbreak',
  'do not follow',
  '###',
  '<script',
  '</script>'
];

const ANCHORED_MEASURE_PHRASES = [
  'resto al sud',
  'autoimpiego centro nord',
  'nuova sabatini',
  'smart start',
  'smart&start',
  'transizione 5.0',
  'transizione 4.0'
];

type SearchCacheRecord = {
  expiresAt: number;
  outcome: SearchOutcome;
};

const SEARCH_CACHE = new Map<string, SearchCacheRecord>();

function sanitizeEvidenceSnippet(raw: string) {
  const cleaned = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[[^\]]+\]\([^)]+\)/g, ' ')
    .replace(/[`*_#>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const lowered = cleaned.toLowerCase();
  for (const token of FORBIDDEN_PROMPT_TOKENS) {
    if (lowered.includes(token)) {
      return 'Contenuto web potenzialmente manipolato rimosso per sicurezza.';
    }
  }

  if (!cleaned) return 'Nessun estratto disponibile.';
  return cleaned.length > 320 ? `${cleaned.slice(0, 320).trim()}…` : cleaned;
}

function inferSourceTier(url: string): SearchSourceTier {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (
      host.endsWith('.gov.it') ||
      host.includes('incentivi.gov.it') ||
      host.includes('invitalia.it') ||
      host.includes('mimit.gov.it') ||
      host.includes('agenziaentrate.gov.it') ||
      host.includes('regione.')
    ) {
      return 'official';
    }
    if (
      host.includes('camcom.it') ||
      host.includes('unioncamere') ||
      host.includes('italiaoggi.it') ||
      host.includes('ilsole24ore.com') ||
      host.includes('fasi.biz') ||
      host.includes('confartigianato') ||
      host.includes('confindustria')
    ) {
      return 'authoritative';
    }
  } catch {
    return 'web';
  }
  return 'web';
}

function normalizeUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (!isAllowedOutboundUrl(url)) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
  const match172 = host.match(/^172\.(\d+)\.\d+\.\d+$/);
  if (match172) {
    const second = Number.parseInt(match172[1] ?? '0', 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function isAllowedOutboundUrl(url: URL) {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (isPrivateHost(url.hostname)) return false;
  return true;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlEntityDecode(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function htmlToText(value: string) {
  return htmlEntityDecode(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseBooleanEnv(raw: string | undefined, fallback: boolean) {
  if (!raw) return fallback;
  const value = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return fallback;
}

function getCacheTtlMs() {
  const parsed = Number.parseInt(String(process.env.WEBSEARCH_CACHE_TTL_SEC ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_CACHE_TTL_MS;
  return parsed * 1000;
}

function getProviderMode() {
  return String(process.env.WEBSEARCH_PROVIDER ?? 'free').trim().toLowerCase();
}

function buildCacheKey(query: string, mode: string, allowPaidFallback: boolean) {
  return `${mode}|${allowPaidFallback ? 'paid1' : 'paid0'}|${normalizeText(query)}`;
}

function getCachedOutcome(cacheKey: string) {
  const found = SEARCH_CACHE.get(cacheKey);
  if (!found) return null;
  if (found.expiresAt <= Date.now()) {
    SEARCH_CACHE.delete(cacheKey);
    return null;
  }
  return found.outcome;
}

function setCachedOutcome(cacheKey: string, outcome: SearchOutcome) {
  SEARCH_CACHE.set(cacheKey, {
    expiresAt: Date.now() + getCacheTtlMs(),
    outcome,
  });
}

function tokenizeQuery(query: string) {
  const stopwords = new Set([
    'requisiti',
    'scadenza',
    'aggiornamenti',
    'bando',
    'bandi',
    'italia',
    'incentivo',
    'incentivi',
    'come',
    'quando',
    '2024',
    '2025',
    '2026'
  ]);
  return normalizeText(query)
    .split(' ')
    .filter((token) => token.length >= 3 && !stopwords.has(token));
}

function anchoredPhraseFromQuery(query: string) {
  const normalized = normalizeText(query);
  return ANCHORED_MEASURE_PHRASES.find((phrase) => normalized.includes(normalizeText(phrase))) ?? null;
}

function isRelevantResult(result: SearchResult, query: string) {
  const text = normalizeText(`${result.title} ${result.evidenceSnippet} ${result.url}`);
  const anchoredPhrase = anchoredPhraseFromQuery(query);
  if (anchoredPhrase) {
    const normalizedPhrase = normalizeText(anchoredPhrase);
    if (text.includes(normalizedPhrase)) return true;
    const phraseTokens = normalizedPhrase.split(' ').filter((token) => token.length >= 3);
    if (phraseTokens.length > 0 && phraseTokens.every((token) => text.includes(token))) return true;
    return false;
  }

  const queryTokens = tokenizeQuery(query);
  if (queryTokens.length === 0) return true;
  const overlap = queryTokens.filter((token) => text.includes(token)).length;
  return overlap >= Math.min(2, queryTokens.length);
}

function dedupeByUrl(results: SearchResult[]) {
  const seen = new Set<string>();
  const unique: SearchResult[] = [];
  for (const result of results) {
    const normalized = normalizeUrl(result.url);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push({ ...result, url: normalized });
  }
  return unique;
}

function sortByTierAndRecency(results: SearchResult[]) {
  const tierWeight: Record<SearchSourceTier, number> = {
    official: 3,
    authoritative: 2,
    web: 1
  };
  return [...results].sort((left, right) => {
    const tierDiff = tierWeight[right.sourceTier] - tierWeight[left.sourceTier];
    if (tierDiff !== 0) return tierDiff;
    const leftTime = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
    const rightTime = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
    return rightTime - leftTime;
  });
}

function limitTierMix(results: SearchResult[]) {
  const official = results.filter((r) => r.sourceTier === 'official');
  const authoritative = results.filter((r) => r.sourceTier === 'authoritative');
  const web = results.filter((r) => r.sourceTier === 'web');
  return [...official.slice(0, 4), ...authoritative.slice(0, 2), ...web.slice(0, 2)].slice(0, MAX_RESULTS);
}

function maybeIsoDate(raw: string | undefined) {
  if (!raw || !raw.trim()) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function buildQueryVariants(query: string) {
  const anchored = anchoredPhraseFromQuery(query);
  const variants = new Set<string>([query.trim()]);
  if (anchored) {
    variants.add(`${anchored} requisiti aggiornati`);
    variants.add(`${anchored} invitalia voucher fondo perduto`);
    variants.add(`${anchored} percentuale contributo`);
  }
  return [...variants].filter((entry) => entry.length >= 4).slice(0, 4);
}

async function searchViaIncentivi(query: string): Promise<SearchResult[]> {
  const params = new URLSearchParams();
  params.set('wt', 'json');
  params.set('rows', '8');
  params.set('fq', 'index_id:incentivi');
  params.set(
    'fl',
    'title:zs_title,authorityName:zs_field_subject_grant,openDate:zs_field_open_date,closeDate:zs_field_close_date,updatedAt:ds_last_update,institutionalLink:zs_field_link,url:zs_url,description:zs_body,score'
  );
  params.set('defType', 'edismax');
  params.set('q', query.trim());
  params.set('qf', 'tum_X3b_it_title_ft^4 twm_X3b_it_field_search_meta^2.5 tum_X3b_it_body_ft^1');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(`${INCENTIVI_SOLR_ENDPOINT}?${params.toString()}`, {
      method: 'GET',
      headers: { 'User-Agent': 'BNDO-WebSearch/2.0' },
      signal: controller.signal
    });
    if (!response.ok) return [];
    const payload = (await response.json().catch(() => null)) as { response?: { docs?: IncentiviDoc[] } } | null;
    const docs = payload?.response?.docs ?? [];
    if (!Array.isArray(docs)) return [];

    const mapped: SearchResult[] = [];
    for (const doc of docs) {
      const url = doc.institutionalLink || doc.url;
      if (!url) continue;
      const title = (doc.title ?? '').trim();
      if (!title) continue;
      const authority = (doc.authorityName ?? '').trim();
      const snippet = sanitizeEvidenceSnippet(
        [authority ? `Ente: ${authority}.` : null, doc.description ? String(doc.description) : null].filter(Boolean).join(' ')
      );
      mapped.push({
        title,
        url,
        evidenceSnippet: snippet,
        sourceTier: 'official',
        publishedAt: maybeIsoDate(doc.updatedAt) ?? maybeIsoDate(doc.openDate) ?? maybeIsoDate(doc.closeDate)
      });
    }
    return mapped;
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

async function searchViaSerper(query: string, apiKey: string): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(SERPER_ENDPOINT, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: query,
        gl: 'it',
        hl: 'it',
        num: 8
      }),
      signal: controller.signal
    });
    if (!response.ok) return [];
    const payload = (await response.json().catch(() => null)) as { organic?: SerperOrganicResult[] } | null;
    const organic = payload?.organic ?? [];
    if (!Array.isArray(organic)) return [];
    const mapped: SearchResult[] = [];
    for (const entry of organic) {
      const title = (entry.title ?? '').trim();
      const url = (entry.link ?? '').trim();
      const snippet = sanitizeEvidenceSnippet((entry.snippet ?? '').trim());
      if (!title || !url) continue;
      mapped.push({
        title,
        url,
        evidenceSnippet: snippet,
        sourceTier: inferSourceTier(url),
        publishedAt: maybeIsoDate(entry.date)
      });
    }
    return mapped;
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

function decodeDuckDuckGoHref(rawHref: string) {
  const trimmed = htmlEntityDecode(rawHref).trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith('//')) {
      const parsed = new URL(`https:${trimmed}`);
      if (parsed.hostname.includes('duckduckgo.com') && parsed.pathname.startsWith('/l/')) {
        const uddg = parsed.searchParams.get('uddg');
        if (uddg) return decodeURIComponent(uddg);
      }
      return parsed.toString();
    }
    if (trimmed.startsWith('/l/')) {
      const parsed = new URL(`https://duckduckgo.com${trimmed}`);
      const uddg = parsed.searchParams.get('uddg');
      if (uddg) return decodeURIComponent(uddg);
      return parsed.toString();
    }
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return null;
  } catch {
    return null;
  }
}

async function searchViaDuckDuckGo(query: string): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5200);
  try {
    const params = new URLSearchParams();
    params.set('q', query);
    params.set('kl', 'it-it');
    params.set('kp', '-2');
    const response = await fetch(`${DDG_HTML_ENDPOINT}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BNDO-WebSearch/2.0; +https://bndo.it)',
        'Accept-Language': 'it-IT,it;q=0.9,en;q=0.7'
      },
      signal: controller.signal
    });
    if (!response.ok) return [];
    const html = await response.text();
    if (!html || html.length < 100) return [];

    const blocks = html.split(/<div class="result[^"]*">/i).slice(1);
    const mapped: SearchResult[] = [];
    for (const block of blocks) {
      if (mapped.length >= MAX_RESULTS) break;
      const linkMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;

      const url = decodeDuckDuckGoHref(linkMatch[1] ?? '');
      if (!url) continue;

      const title = htmlToText(linkMatch[2] ?? '');
      if (!title) continue;

      const snippetMatch =
        block.match(/<(?:a|div)[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/i) ??
        block.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
      const snippet = sanitizeEvidenceSnippet(htmlToText(snippetMatch?.[1] ?? ''));

      mapped.push({
        title,
        url,
        evidenceSnippet: snippet || 'Nessun estratto disponibile.',
        sourceTier: inferSourceTier(url),
        publishedAt: null
      });
    }
    return mapped;
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

export class WebSearchService {
  static async search(query: string): Promise<SearchOutcome> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return {
        ok: false,
        query: normalizedQuery,
        results: [],
        providersUsed: [],
        unavailableReason: 'Query vuota.'
      };
    }

    const providerMode = getProviderMode();
    const allowPaidFallback = parseBooleanEnv(process.env.WEBSEARCH_ALLOW_PAID_FALLBACK, false);
    const cacheKey = buildCacheKey(normalizedQuery, providerMode, allowPaidFallback);
    const cached = getCachedOutcome(cacheKey);
    if (cached) {
      return { ...cached, query: normalizedQuery };
    }

    const providersUsed = new Set<string>();
    const collected: SearchResult[] = [];
    const queryVariants = buildQueryVariants(normalizedQuery);

    const incentiviSettled = await Promise.allSettled(queryVariants.map((variant) => searchViaIncentivi(variant)));
    for (const entry of incentiviSettled) {
      if (entry.status !== 'fulfilled') continue;
      if (entry.value.length > 0) {
        providersUsed.add('incentivi.gov.it');
        collected.push(...entry.value);
      }
    }

    const useFreeWebProvider = !['official', 'official_only'].includes(providerMode);
    if (useFreeWebProvider) {
      const ddgSettled = await Promise.allSettled(queryVariants.slice(0, 3).map((variant) => searchViaDuckDuckGo(variant)));
      for (const entry of ddgSettled) {
        if (entry.status !== 'fulfilled') continue;
        if (entry.value.length > 0) {
          providersUsed.add('duckduckgo/html');
          collected.push(...entry.value);
        }
      }
    }

    const serperApiKey = process.env.SERPER_API_KEY?.trim();
    if (allowPaidFallback && serperApiKey) {
      const serperSettled = await Promise.allSettled(
        queryVariants.slice(0, 3).map((variant) => searchViaSerper(variant, serperApiKey))
      );
      for (const entry of serperSettled) {
        if (entry.status !== 'fulfilled') continue;
        if (entry.value.length > 0) {
          providersUsed.add('serper/google');
          collected.push(...entry.value);
        }
      }
    }

    if (collected.length === 0) {
      const degraded: SearchOutcome = {
        ok: false,
        query: normalizedQuery,
        results: [],
        providersUsed: [...providersUsed],
        unavailableReason:
          useFreeWebProvider || (allowPaidFallback && serperApiKey)
            ? 'Nessun risultato verificabile trovato online.'
            : 'Ricerca web esterna disattivata: disponibili solo fonti ufficiali interne.'
      };
      setCachedOutcome(cacheKey, degraded);
      return degraded;
    }

    const sorted = sortByTierAndRecency(dedupeByUrl(collected));
    const relevant = sorted.filter((result) => isRelevantResult(result, normalizedQuery));
    const anchored = anchoredPhraseFromQuery(normalizedQuery);

    const fallbackPool = relevant.length > 0 ? relevant : sorted;
    const mixed = limitTierMix(fallbackPool);
    const tierSet = new Set(mixed.map((item) => item.sourceTier));
    const warnings: string[] = [];
    if (!(tierSet.has('official') && tierSet.has('authoritative'))) {
      warnings.push('Copertura fonti parziale: risposta basata su fonti disponibili in questo momento.');
    }
    if (anchored && relevant.length === 0) {
      warnings.push(`Pertinenza parziale per la misura "${anchored}": verifica finale consigliata.`);
    }
    if (!useFreeWebProvider) {
      warnings.push('Ricerca web esterna limitata alla modalità ufficiale.');
    }

    const outcome: SearchOutcome = {
      ok: true,
      query: normalizedQuery,
      results: mixed,
      providersUsed: [...providersUsed],
      warning: warnings.length > 0 ? warnings.join(' ') : undefined
    };
    setCachedOutcome(cacheKey, outcome);
    return outcome;
  }
}
