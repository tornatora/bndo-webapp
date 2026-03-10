import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import type { Config } from '@netlify/functions';
import { ACTIVE_SOURCES, scrapePageText } from '../../lib/scraping/scraperSources';
import { extractGrantFromText } from '../../lib/scraping/scraperAiExtractor';

// Initialize Supabase Admin strictly for Serverless Function
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async (req: Request) => {
  console.log('[scrape-regional-grants] Starting nightly regional web scraper...');

  const summary = {
    urlsFound: 0,
    urlsProcessed: 0,
    newGrantsAdded: 0,
    errors: 0
  };

  try {
    for (const source of ACTIVE_SOURCES) {
      console.log(`[scrape-regional-grants] Processing source: ${source.name} (${source.url})`);

      // 1. Fetch the main listing page
      const res = await fetch(source.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      if (!res.ok) {
        console.error(`[scrape-regional-grants] Could not fetch ${source.url} - Status: ${res.status}`);
        summary.errors++;
        continue;
      }

      const html = await res.text();
      const $ = cheerio.load(html);

      // 2. Find all grant detail links on the listing page using the provided CSS selector
      const links = new Set<string>();
      $(source.linksSelector).each((_, el) => {
        let href = $(el).attr('href');
        if (href) {
          // Resolve relative URLs
          if (href.startsWith('/')) {
            href = `${source.baseUrl}${href}`;
          }
          links.add(href);
        }
      });

      summary.urlsFound += links.size;
      console.log(`[scrape-regional-grants] Found ${links.size} grant links for ${source.region}.`);

      // 3. Process each link
      for (const link of Array.from(links)) {
        summary.urlsProcessed++;
        
        // Skip if already in DB
        const { data: existing } = await supabase
          .from('regional_scraped_grants')
          .select('id')
          .eq('source_url', link)
          .maybeSingle();

        if (existing) {
          console.log(`[scrape-regional-grants] URL already in DB, skipping: ${link}`);
          continue;
        }

        // Delay to avoid ban (rate-limiting ourselves)
        await new Promise(r => setTimeout(r, 2000));

        console.log(`[scrape-regional-grants] Scraping new grant page: ${link}`);
        // 4. Scrape the detail page text
        const pageContent = await scrapePageText(link, source.contentSelector);
        if (!pageContent || pageContent.text.length < 100) {
          console.warn(`[scrape-regional-grants] Not enough text found on ${link}, skipping.`);
          continue;
        }

        // 5. Ask OpenAI to extract structured data
        console.log(`[scrape-regional-grants] Asking OpenAI to extract structured data...`);
        const extractedDoc = await extractGrantFromText(pageContent.title, pageContent.text, link);

        if (!extractedDoc) {
          console.error(`[scrape-regional-grants] AI extraction failed for ${link}`);
          summary.errors++;
          continue;
        }

        // Hardcode the region to the source region if AI missed it
        if (!extractedDoc.regions || extractedDoc.regions.length === 0) {
           extractedDoc.regions = [source.region];
        }

        // 6. Save to Supabase
        const { error: insertError } = await supabase
          .from('regional_scraped_grants')
          .insert({
            source_url: link,
            authority_name: extractedDoc.authorityName || source.name,
            title: extractedDoc.title,
            region: source.region,
            status: 'active',
            doc_json: extractedDoc
          });

        if (insertError) {
           console.error(`[scrape-regional-grants] Failed to save to Supabase:`, insertError);
           summary.errors++;
        } else {
           console.log(`[scrape-regional-grants] Successfully extracted and saved: ${extractedDoc.title}`);
           summary.newGrantsAdded++;
        }
      }
    }

    console.log('[scrape-regional-grants] Run complete.', summary);

    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[scrape-regional-grants] Fatal error:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err), summary }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Run at 04:00 AM UTC everyday (right after incentives.gov refresh)
export const config: Config = {
  schedule: '0 4 * * *'
};
