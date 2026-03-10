import { OpenAI } from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { IncentiviDoc } from '@/lib/matching/types';

const openai = new OpenAI(); // Automatically uses OPENAI_API_KEY from environment

// Schema definition for the expected JSON structured output
const incentivesDocSchema = z.object({
  title: z.string().describe('Il nome esteso del bando o agevolazione (massimo 200 caratteri).'),
  description: z.string().describe('Descrizione dettagliata del bando: a chi si rivolge, cosa finanzia e i requisiti principali.'),
  authorityName: z.string().describe('Nome dell\'ente erogatore (es. Regione Lombardia, Sviluppo Campania, Camera di Commercio...).'),
  openDate: z.string().nullable().describe('Data di apertura del bando (ISO 8601). Null se non specificato o bando a sportello sempre aperto.'),
  closeDate: z.string().nullable().describe('Data di chiusura del bando (ISO 8601). Null se a esaurimento risorse o non specificato.'),
  regions: z.array(z.string()).describe('Lista di regioni italiane interessate. Es: ["Lombardia"], ["Campania"]. IMPORTANTE: Inserire il nome della singola regione senza abbreviazioni.'),
  sectors: z.array(z.string()).describe('Settori macro ammessi scelti tra: ["Agricoltura", "Artigianato", "Commercio", "Cultura", "Digitale", "Edilizia", "ICT", "Manifattura", "Ristorazione", "Servizi", "Turismo", "Trasporti"]. Se tutti, lista estesa.'),
  beneficiaries: z.array(z.string()).describe('Tipologie di beneficiario scelte ESCLUSIVAMENTE tra: ["PMI", "Micro Impresa", "Piccola Impresa", "Media Impresa", "Grande Impresa", "Aspiranti imprenditori", "Startup", "Nuova impresa", "Libero professionista", "Lavoro autonomo"].'),
  purposes: z.array(z.string()).describe('Finalita scelte ESCLUSIVAMENTE tra: ["Start up/Sviluppo d impresa", "Investimenti produttivi", "Innovazione", "Digitalizzazione", "Acquisto macchinari", "Internazionalizzazione", "Autoimpiego", "Turismo", "Assunzioni", "Efficientamento energetico", "Beni strumentali"].'),
  supportForm: z.array(z.string()).describe('Forma di supporto scelta tra: ["Contributo/Fondo perduto", "Finanziamento agevolato", "Voucher", "Credito d imposta", "Garanzia"].'),
  ateco: z.string().describe('Codici ATECO ammessi come stringa testuale, es. "Tutti i settori tranne agricoltura" oppure i codici specifici "55.10, 56.10".'),
  costMin: z.number().nullable().describe('Investimento o spesa minima ammissibile in euro. Null se non specificata.'),
  costMax: z.number().nullable().describe('Investimento o spesa massima ammissibile in euro. Null se non specificata.'),
  displayAmountLabel: z.string().describe('Stringa breve per mostrare il contributo massimo, es: "Fino a 50.000 (50%)" oppure "Voucher di 10.000 euro".'),
  displayProjectAmountLabel: z.string().describe('Stringa breve per mostrare l\'investimento massimo, es: "Progetti fino a 100.000 euro". Vuoto se non applicabile.'),
  displayCoverageLabel: z.string().describe('Stringa che mostra la % di fondo perduto/agevolazione, es: "50% - 70%" oppure "Fino al 100%".'),
  coverageMinPercent: z.number().nullable().describe('Percentuale minima di copertura del fondo (0-100). Null se non specificato.'),
  coverageMaxPercent: z.number().nullable().describe('Percentuale massima di copertura del fondo (0-100). Null se non specificato.'),
  institutionalLink: z.string().describe('Il link originale fornito alla pagina ufficiale del bando.')
});

export type ExtractedIncentivesDoc = z.infer<typeof incentivesDocSchema>;

/**
 * Parses raw text extracted from a regional grant webpage and uses OpenAI
 * to structure it into the canonical BNDO `IncentiviDoc` format.
 */
export async function extractGrantFromText(
  pageTitle: string,
  rawText: string,
  sourceUrl: string
): Promise<IncentiviDoc | null> {
  const systemPrompt = `Sei un esperto consulente di finanza agevolata italiana in grado di leggere bandi e trasformarli in dati strutturati perfetti per un database relazionale.
Devi analizzare il testo grezzo estratto da una pagina web ufficiale (spesso confuso o incompleto) ed estrarre tutti i campi richiesti.
Regole per i massimali (costMax) ed importi: estrai sempre GLI IMPORTI MASSIMI di spesa.
Regole per ATECO: se il bando indica "Tutte le imprese iscritte alla CCIAA tranne agricoltura", scrivi. "Tutti tranne A". Cerca di includere i numeri (es. 55, 56) se ci sono nel testo.
Regole temporali: se non c'è una data di scadenza definita (es. "fino ad esaurimento scorte" o "a sportello continuo"), usa null per closeDate.
Sii preciso e sintetico nelle "display labels", massimo 5 parole.`;

  const userPrompt = `
Titolo pagina: ${pageTitle}
URL Originale: ${sourceUrl}

Testo della pagina:
"""
${rawText.slice(0, 15000)} // Limit to fit within prompt safely
"""

Estrai le informazioni necessarie per creare l'IncentiviDoc strutturato.
  `;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Fast, cheap, and very good at structured outputs
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1, // Low temp for maximum factual accuracy
    });

    const rawContent = completion.choices[0]?.message.content;
    if (!rawContent) {
      console.warn('[extractGrantFromText] OpenAI returned empty content.');
      return null;
    }

    const parsed = incentivesDocSchema.parse(JSON.parse(rawContent));
    
    if (!parsed) {
      console.warn('[extractGrantFromText] OpenAI returned an empty or invalid parsed object.');
      return null;
    }

    // Convert the parsed generic AI object into the strict format expected by BNDO matching engine
    const docId = `scraped-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const finalDoc: IncentiviDoc = {
      id: docId,
      title: parsed.title,
      description: parsed.description,
      authorityName: parsed.authorityName,
      openDate: parsed.openDate || undefined,
      closeDate: parsed.closeDate || undefined,
      regions: parsed.regions.length > 0 ? parsed.regions : undefined,
      sectors: parsed.sectors.length > 0 ? parsed.sectors : undefined,
      beneficiaries: parsed.beneficiaries.length > 0 ? parsed.beneficiaries : undefined,
      dimensions: parsed.beneficiaries.filter(b => ['PMI', 'Micro Impresa', 'Piccola Impresa', 'Media Impresa', 'Grande Impresa'].includes(b)),
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
      institutionalLink: sourceUrl, // Force original
      url: `/incentivi-e-strumenti/${docId}` // Virtual internal URL
    };

    return finalDoc;
  } catch (error) {
    console.error('[extractGrantFromText] Error extracting grant data with OpenAI:', error);
    return null;
  }
}
