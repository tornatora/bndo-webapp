import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";
import { z } from "zod";
import { OpenAI } from "openai";

const SOURCE_LOMBARDIA = {
  id: "finlombarda",
  name: "Finlombarda - Bandi e Agevolazioni",
  url: "https://www.finlombarda.it/wps/portal/site/finlombarda/Bandi",
  region: "Lombardia",
  linksSelector: ".bando-item a.bando-title",
  titleSelector: "h1.page-title",
  contentSelector: ".bando-content-detail",
  baseUrl: "https://www.finlombarda.it",
};

const SOURCE_CAMPANIA = {
  id: "sviluppo-campania",
  name: "Sviluppo Campania - Avvisi",
  url: "https://www.sviluppocampania.it/avvisi/",
  region: "Campania",
  linksSelector: "article.type-post h2.entry-title a",
  titleSelector: "h1.entry-title",
  contentSelector: ".entry-content",
  baseUrl: "https://www.sviluppocampania.it",
};

const ACTIVE_SOURCES = [SOURCE_LOMBARDIA, SOURCE_CAMPANIA];

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
  const m = host.match(/^172\.(\d+)\.\d+\.\d+$/);
  if (m) {
    const second = Number.parseInt(m[1] ?? "0", 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function isAllowedUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (isPrivateHost(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

async function scrapePageText(url, contentSelector) {
  try {
    if (!isAllowedUrl(url)) {
      console.warn(`[scrapePageText] Blocked URL by outbound policy: ${url}`);
      return null;
    }
    const res = await fetch(url, {
      headers: {
        "User-Agent": "BNDO-Scanner-Bot/1.0 (Research & Indexing)",
      },
    });
    if (!res.ok) {
      console.warn(`[scrapePageText] Failed to fetch ${url} - Status: ${res.status}`);
      return null;
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    const title = $("title").text().trim() || "Titolo Sconosciuto";
    let contentHtml = $(contentSelector).html();
    if (!contentHtml) {
      $("script, style, nav, header, footer").remove();
      contentHtml = $("body").html();
    }
    if (!contentHtml) return null;
    const text = cheerio.load(contentHtml).text().replace(/\s+/g, " ").trim();
    return { title, text };
  } catch (err) {
    console.error(`[scrapePageText] Error scraping ${url}:`, err);
    return null;
  }
}

const incentivesDocSchema = z.object({
  title: z.string(),
  description: z.string(),
  authorityName: z.string(),
  openDate: z.string().nullable(),
  closeDate: z.string().nullable(),
  regions: z.array(z.string()),
  sectors: z.array(z.string()),
  beneficiaries: z.array(z.string()),
  purposes: z.array(z.string()),
  supportForm: z.array(z.string()),
  ateco: z.string(),
  costMin: z.number().nullable(),
  costMax: z.number().nullable(),
  displayAmountLabel: z.string(),
  displayProjectAmountLabel: z.string(),
  displayCoverageLabel: z.string(),
  coverageMinPercent: z.number().nullable(),
  coverageMaxPercent: z.number().nullable(),
  institutionalLink: z.string(),
});

async function extractGrantFromText(pageTitle, rawText, sourceUrl) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY non configurata per lo scraping.");
  }
  const client = new OpenAI({ apiKey });

  const systemPrompt = `Sei un esperto consulente di finanza agevolata italiana in grado di leggere bandi e trasformarli in dati strutturati perfetti per un database relazionale.
Devi analizzare il testo grezzo estratto da una pagina web ufficiale (spesso confuso o incompleto) ed estrarre tutti i campi richiesti.
Regole per i massimali (costMax) ed importi: estrai sempre GLI IMPORTI MASSIMI di spesa.
Regole per ATECO: se il bando indica "Tutte le imprese iscritte alla CCIAA tranne agricoltura", scrivi "Tutti tranne A". Cerca di includere i numeri (es. 55, 56) se ci sono nel testo.
Regole temporali: se non c'è una data di scadenza definita (es. "fino ad esaurimento scorte" o "a sportello continuo"), usa null per closeDate.
Sii preciso e sintetico nelle "display labels", massimo 5 parole.`;

  const userPrompt = `
Titolo pagina: ${pageTitle}
URL Originale: ${sourceUrl}

Testo della pagina:
"""\n${rawText.slice(0, 15000)}\n"""

Estrai le informazioni necessarie per creare l'IncentiviDoc strutturato.
  `;

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const rawContent = completion.choices[0]?.message.content;
    if (!rawContent) return null;

    const parsed = incentivesDocSchema.parse(JSON.parse(rawContent));
    if (!parsed) return null;

    const docId = `scraped-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    return {
      id: docId,
      title: parsed.title,
      description: parsed.description,
      authorityName: parsed.authorityName,
      openDate: parsed.openDate || undefined,
      closeDate: parsed.closeDate || undefined,
      regions: parsed.regions.length > 0 ? parsed.regions : undefined,
      sectors: parsed.sectors.length > 0 ? parsed.sectors : undefined,
      beneficiaries: parsed.beneficiaries.length > 0 ? parsed.beneficiaries : undefined,
      dimensions: parsed.beneficiaries.filter((b) =>
        ["PMI", "Micro Impresa", "Piccola Impresa", "Media Impresa", "Grande Impresa"].includes(b)
      ),
      purposes: parsed.purposes.length > 0 ? parsed.purposes : undefined,
      supportForm: parsed.supportForm.length > 0 ? parsed.supportForm : undefined,
      ateco: parsed.ateco,
      costMin: parsed.costMin || undefined,
      costMax: parsed.costMax || undefined,
      displayAmountLabel: parsed.displayAmountLabel,
      displayProjectAmountLabel: parsed.displayProjectAmountLabel || undefined,
      displayCoverageLabel: parsed.displayCoverageLabel,
      coverageMinPercent: parsed.coverageMinPercent || undefined,
      coverageMaxPercent: parsed.coverageMaxPercent || undefined,
      institutionalLink: sourceUrl,
      url: `/incentivi-e-strumenti/${docId}`,
    };
  } catch (error) {
    console.error("[extractGrantFromText] Error:", error);
    return null;
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async (req) => {
  console.log("[scrape-regional-grants] Starting nightly regional web scraper...");
  const summary = { urlsFound: 0, urlsProcessed: 0, newGrantsAdded: 0, errors: 0 };

  try {
    for (const source of ACTIVE_SOURCES) {
      console.log(`[scrape-regional-grants] Processing source: ${source.name} (${source.url})`);

      const res = await fetch(source.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (!res.ok) {
        console.error(`[scrape-regional-grants] Could not fetch ${source.url} - Status: ${res.status}`);
        summary.errors++;
        continue;
      }

      const html = await res.text();
      const $ = cheerio.load(html);
      const links = new Set();

      $(source.linksSelector).each((_, el) => {
        let href = $(el).attr("href");
        if (href) {
          if (href.startsWith("/")) href = `${source.baseUrl}${href}`;
          links.add(href);
        }
      });

      summary.urlsFound += links.size;
      console.log(`[scrape-regional-grants] Found ${links.size} grant links for ${source.region}.`);

      for (const link of Array.from(links)) {
        summary.urlsProcessed++;

        const { data: existing } = await supabase
          .from("regional_scraped_grants")
          .select("id")
          .eq("source_url", link)
          .maybeSingle();

        if (existing) {
          console.log(`[scrape-regional-grants] URL already in DB, skipping: ${link}`);
          continue;
        }

        await new Promise((r) => setTimeout(r, 2000));
        console.log(`[scrape-regional-grants] Scraping new grant page: ${link}`);

        const pageContent = await scrapePageText(link, source.contentSelector);
        if (!pageContent || pageContent.text.length < 100) {
          console.warn(`[scrape-regional-grants] Not enough text found on ${link}, skipping.`);
          continue;
        }

        console.log(`[scrape-regional-grants] Asking OpenAI to extract structured data...`);
        const extractedDoc = await extractGrantFromText(pageContent.title, pageContent.text, link);

        if (!extractedDoc) {
          console.error(`[scrape-regional-grants] AI extraction failed for ${link}`);
          summary.errors++;
          continue;
        }

        if (!extractedDoc.regions || extractedDoc.regions.length === 0) {
          extractedDoc.regions = [source.region];
        }

        const { error: insertError } = await supabase.from("regional_scraped_grants").insert({
          source_url: link,
          authority_name: extractedDoc.authorityName || source.name,
          title: extractedDoc.title,
          region: source.region,
          status: "active",
          doc_json: extractedDoc,
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

    console.log("[scrape-regional-grants] Run complete.", summary);
    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[scrape-regional-grants] Fatal error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err), summary }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = {
  schedule: "0 4 * * *",
};
