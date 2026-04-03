import * as cheerio from 'cheerio';

export interface ScrapingSource {
  id: string;
  name: string;
  url: string;
  region: string;
  linksSelector: string;
  titleSelector: string;
  contentSelector: string;
  baseUrl: string; // Used to resolve relative links
}

/**
 * Proof of Concept Source 1: Finlombarda (Regione Lombardia)
 * This is a mocked selector example for their "Bandi" list.
 */
export const SOURCE_LOMBARDIA: ScrapingSource = {
  id: 'finlombarda',
  name: 'Finlombarda - Bandi e Agevolazioni',
  url: 'https://www.finlombarda.it/wps/portal/site/finlombarda/Bandi',
  region: 'Lombardia',
  linksSelector: '.bando-item a.bando-title', // A valid CSS selector for the specific site
  titleSelector: 'h1.page-title',
  contentSelector: '.bando-content-detail',
  baseUrl: 'https://www.finlombarda.it',
};

/**
 * Proof of Concept Source 2: Sviluppo Campania
 */
export const SOURCE_CAMPANIA: ScrapingSource = {
  id: 'sviluppo-campania',
  name: 'Sviluppo Campania - Avvisi',
  url: 'https://www.sviluppocampania.it/avvisi/',
  region: 'Campania',
  linksSelector: 'article.type-post h2.entry-title a',
  titleSelector: 'h1.entry-title',
  contentSelector: '.entry-content',
  baseUrl: 'https://www.sviluppocampania.it',
};

export const ACTIVE_SOURCES: ScrapingSource[] = [
  SOURCE_LOMBARDIA,
  SOURCE_CAMPANIA
];

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
  const m = host.match(/^172\.(\d+)\.\d+\.\d+$/);
  if (m) {
    const second = Number.parseInt(m[1] ?? '0', 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function isAllowedUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (isPrivateHost(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Helper to fetch and extract raw text from a dynamically resolved URL.
 */
export async function scrapePageText(url: string, contentSelector: string): Promise<{ title: string, text: string } | null> {
  try {
    if (!isAllowedUrl(url)) {
      console.warn(`[scrapePageText] Blocked URL by outbound policy: ${url}`);
      return null;
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'BNDO-Scanner-Bot/1.0 (Research & Indexing)'
      }
    });
    
    if (!res.ok) {
      console.warn(`[scrapePageText] Failed to fetch ${url} - Status: ${res.status}`);
      return null;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const title = $('title').text().trim() || 'Titolo Sconosciuto';
    
    // Extract text specifically from the main content container to avoid headers/footers/menus
    let contentHtml = $(contentSelector).html();
    
    // Fallback if selector is wrong or page changed: grab the body but remove scripts/styles
    if (!contentHtml) {
      $('script, style, nav, header, footer').remove();
      contentHtml = $('body').html();
    }

    if (!contentHtml) return null;

    // Load the isolated content and get raw text
    const text = cheerio.load(contentHtml).text()
      .replace(/\s+/g, ' ') // normalize whitespace
      .trim();

    return { title, text };

  } catch (err) {
    console.error(`[scrapePageText] Error scraping ${url}:`, err);
    return null;
  }
}
