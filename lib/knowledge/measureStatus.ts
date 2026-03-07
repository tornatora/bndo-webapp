import { normalizeForMatch } from '@/lib/text/normalize';

const INCENTIVI_SOLR_ENDPOINT = 'https://www.incentivi.gov.it/solr/coredrupal/select';
const INCENTIVI_BASE_URL = 'https://www.incentivi.gov.it';

type KnownMeasure = {
  id: string;
  canonicalName: string;
  aliases: string[];
  preferredAuthorityTokens: string[];
  officialUrl: string;
};

type SolrMeasureDoc = {
  title?: string;
  authorityName?: string;
  openDate?: string;
  closeDate?: string;
  url?: string;
  institutionalLink?: string;
  score?: number;
};

const KNOWN_MEASURES: KnownMeasure[] = [
  {
    id: 'resto-al-sud-20',
    canonicalName: 'Resto al Sud 2.0',
    aliases: ['resto al sud', 'resto al sud 2.0', 'resto al sud 20'],
    preferredAuthorityTokens: ['invitalia'],
    officialUrl: 'https://www.invitalia.it/incentivi-e-strumenti/resto-al-sud-20',
  },
  {
    id: 'autoimpiego-centro-nord',
    canonicalName: 'Autoimpiego Centro-Nord',
    aliases: ['autoimpiego centro nord', 'autoimpiego', 'centro nord'],
    preferredAuthorityTokens: ['invitalia'],
    officialUrl: 'https://www.invitalia.it/incentivi-e-strumenti/autoimpiego-centro-nord',
  },
];

function parseSolrDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isVersionIntent(normMessage: string): boolean {
  if (!normMessage) return false;
  return (
    /nuov|version|uscit|edizion|aggiornat|apertur|finestra|attiv|disponibil|esiste|2 0|2\.0/.test(normMessage) ||
    normMessage.includes('c e') ||
    normMessage.includes('ce')
  );
}

function detectMeasure(normMessage: string): KnownMeasure | null {
  for (const measure of KNOWN_MEASURES) {
    if (measure.aliases.some((alias) => normMessage.includes(normalizeForMatch(alias)))) {
      return measure;
    }
  }
  return null;
}

function buildCatalogUrl(pathOrUrl: string | undefined, fallback: string): string {
  if (!pathOrUrl) return fallback;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (!pathOrUrl.startsWith('/')) return `${INCENTIVI_BASE_URL}/${pathOrUrl}`;
  return `${INCENTIVI_BASE_URL}${pathOrUrl}`;
}

function isTrustedOfficialUrl(url: string, measure: KnownMeasure): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('invitalia.it')) return true;
    if (host.includes('incentivi.gov.it')) return true;
    const officialHost = new URL(measure.officialUrl).hostname.toLowerCase();
    return host === officialHost;
  } catch {
    return false;
  }
}

function scoreDocForMeasure(doc: SolrMeasureDoc, measure: KnownMeasure): number {
  const titleNorm = normalizeForMatch(doc.title ?? '');
  const authorityNorm = normalizeForMatch(doc.authorityName ?? '');

  let score = Number.isFinite(doc.score) ? Number(doc.score) : 0;

  if (measure.aliases.some((alias) => titleNorm.includes(normalizeForMatch(alias)))) score += 8;
  if (titleNorm.includes(normalizeForMatch(measure.canonicalName))) score += 6;
  if (measure.preferredAuthorityTokens.some((token) => authorityNorm.includes(token))) score += 5;
  if (titleNorm.includes('2 0') || titleNorm.includes('2.0')) score += 3;

  return score;
}

async function fetchMeasureDocs(keyword: string): Promise<SolrMeasureDoc[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const params = new URLSearchParams();
    params.set('wt', 'json');
    params.set('rows', '15');
    params.set('fq', 'index_id:incentivi');
    params.set(
      'fl',
      [
        'title:zs_title',
        'authorityName:zs_field_subject_grant',
        'openDate:zs_field_open_date',
        'closeDate:zs_field_close_date',
        'url:zs_url',
        'institutionalLink:zs_field_link',
        'score',
      ].join(','),
    );
    params.set('defType', 'edismax');
    params.set('q', keyword);
    params.set('qf', 'tum_X3b_it_title_ft^4 twm_X3b_it_field_search_meta^2.5 tum_X3b_it_body_ft^1');

    const response = await fetch(`${INCENTIVI_SOLR_ENDPOINT}?${params.toString()}`, {
      method: 'GET',
      headers: { 'User-Agent': 'BNDO-Measure-Status/1.0' },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const json = (await response.json().catch(() => null)) as { response?: { docs?: SolrMeasureDoc[] } } | null;
    const docs = json?.response?.docs ?? [];
    return Array.isArray(docs) ? docs : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

export function isMeasureUpdateQuestion(message: string): boolean {
  const normMessage = normalizeForMatch(message);
  if (!isVersionIntent(normMessage)) return false;
  return detectMeasure(normMessage) !== null;
}

export async function resolveMeasureUpdateReply(message: string): Promise<string | null> {
  const normMessage = normalizeForMatch(message);
  if (!isVersionIntent(normMessage)) return null;

  const measure = detectMeasure(normMessage);
  if (!measure) return null;

  const docs = await fetchMeasureDocs(measure.canonicalName);
  const best = docs
    .map((doc) => ({ doc, score: scoreDocForMeasure(doc, measure) }))
    .sort((a, b) => b.score - a.score)[0]?.doc;

  const candidateUrl = buildCatalogUrl(best?.institutionalLink ?? best?.url, measure.officialUrl);
  const sourceUrl = isTrustedOfficialUrl(candidateUrl, measure) ? candidateUrl : measure.officialUrl;
  const openDate = parseSolrDate(best?.openDate);
  const closeDate = parseSolrDate(best?.closeDate);
  const now = Date.now();

  let statusLine = 'Sto verificando in tempo reale la finestra operativa.';
  if (openDate && openDate.getTime() > now) {
    statusLine = `La prossima apertura risulta prevista dal ${openDate.toLocaleDateString('it-IT')}.`;
  } else if (openDate && (!closeDate || closeDate.getTime() >= now)) {
    statusLine = 'La misura risulta attiva o in gestione su canale ufficiale.';
  } else if (closeDate && closeDate.getTime() < now) {
    const daysSinceClose = Math.floor((now - closeDate.getTime()) / (1000 * 60 * 60 * 24));
    statusLine =
      daysSinceClose <= 120
        ? `L'ultima finestra nota risulta chiusa al ${closeDate.toLocaleDateString('it-IT')}.`
        : 'La misura risulta confermata e la finestra operativa viene aggiornata periodicamente.';
  }

  return [
    `Sì, ${measure.canonicalName} esiste.`,
    statusLine,
    `Fonte ufficiale: ${sourceUrl}.`,
    'Se vuoi verifico subito la tua ammissibilità: età, stato occupazionale, regione e attività da avviare o già attiva.',
  ].join(' ');
}
