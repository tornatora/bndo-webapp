/**
 * ATECO 2025 Taxonomy — Sezioni ISTAT + Divisioni principali
 * Mappatura codice ATECO 2-digit → Sezione, descrizione, keywords settoriali.
 * Usato per matching strutturato tra codice utente e requisiti bando.
 */

/** ATECO Section (letter A–U) */
export type AtecoSection = {
  letter: string;
  label: string;
  divisions: number[];  // 2-digit codes belonging to this section
  keywords: string[];   // Italian sector keywords for text matching
};

const ATECO_SECTIONS: AtecoSection[] = [
  {
    letter: 'A', label: 'Agricoltura, silvicoltura e pesca',
    divisions: [1, 2, 3],
    keywords: ['agricoltura', 'allevamento', 'pesca', 'acquacoltura', 'silvicoltura', 'agroindustria', 'produzione primaria', 'viticoltura', 'olivicoltura', 'zootecnia'],
  },
  {
    letter: 'B', label: 'Estrazione minerali',
    divisions: [5, 6, 7, 8, 9],
    keywords: ['estrazione', 'minerario', 'cave', 'petrolio', 'gas naturale', 'minerali'],
  },
  {
    letter: 'C', label: 'Attività manifatturiere',
    divisions: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33],
    keywords: ['manifattura', 'produzione', 'trasformazione', 'industria', 'fabbricazione', 'assemblaggio', 'macchinari', 'metalmeccanica', 'alimentare', 'tessile', 'chimica', 'plastica', 'legno', 'carta', 'stampa', 'farmaceutica', 'elettronica', 'veicoli', 'mobili', 'artigianato industriale'],
  },
  {
    letter: 'D', label: 'Fornitura energia elettrica, gas, vapore',
    divisions: [35],
    keywords: ['energia', 'gas', 'elettricità', 'rinnovabili', 'fotovoltaico', 'solare', 'eolico', 'cogenerazione'],
  },
  {
    letter: 'E', label: 'Fornitura acqua, reti fognarie, gestione rifiuti',
    divisions: [36, 37, 38, 39],
    keywords: ['acqua', 'rifiuti', 'depurazione', 'riciclaggio', 'bonifica', 'smaltimento', 'raccolta differenziata'],
  },
  {
    letter: 'F', label: 'Costruzioni',
    divisions: [41, 42, 43],
    keywords: ['costruzioni', 'edilizia', 'edile', 'ingegneria civile', 'ristrutturazione', 'impiantistica', 'muratura', 'carpenteria'],
  },
  {
    letter: 'G', label: 'Commercio all\'ingrosso e al dettaglio; riparazione autoveicoli',
    divisions: [45, 46, 47],
    keywords: ['commercio', 'vendita', 'dettaglio', 'ingrosso', 'negozio', 'rivendita', 'distribuzione', 'ecommerce', 'retail', 'autoveicoli'],
  },
  {
    letter: 'H', label: 'Trasporto e magazzinaggio',
    divisions: [49, 50, 51, 52, 53],
    keywords: ['trasporto', 'logistica', 'magazzino', 'spedizioni', 'corriere', 'movimentazione', 'autotrasporto', 'navale', 'aereo'],
  },
  {
    letter: 'I', label: 'Attività dei servizi di alloggio e ristorazione',
    divisions: [55, 56],
    keywords: ['alloggio', 'ristorazione', 'hotel', 'albergo', 'b&b', 'ristorante', 'bar', 'catering', 'turismo ricettivo', 'pizzeria', 'pub', 'trattoria', 'agriturismo', 'ostello'],
  },
  {
    letter: 'J', label: 'Servizi di informazione e comunicazione',
    divisions: [58, 59, 60, 61, 62, 63],
    keywords: ['informatica', 'software', 'ict', 'digitale', 'telecomunicazioni', 'programmazione', 'web', 'app', 'cloud', 'cybersecurity', 'editoria digitale', 'media', 'sviluppo software', 'saas', 'intelligenza artificiale', 'ai'],
  },
  {
    letter: 'K', label: 'Attività finanziarie e assicurative',
    divisions: [64, 65, 66],
    keywords: ['finanza', 'banca', 'assicurazione', 'credito', 'investimento', 'intermediazione finanziaria', 'fintech'],
  },
  {
    letter: 'L', label: 'Attività immobiliari',
    divisions: [68],
    keywords: ['immobiliare', 'gestione immobili', 'compravendita immobili', 'affitto', 'agenzia immobiliare'],
  },
  {
    letter: 'M', label: 'Attività professionali, scientifiche e tecniche',
    divisions: [69, 70, 71, 72, 73, 74, 75],
    keywords: ['consulenza', 'professionale', 'studio', 'ingegneria', 'architettura', 'ricerca', 'design', 'pubblicità', 'marketing', 'contabilità', 'legale', 'veterinario', 'scienze', 'R&D'],
  },
  {
    letter: 'N', label: 'Noleggio, agenzie di viaggio, servizi di supporto alle imprese',
    divisions: [77, 78, 79, 80, 81, 82],
    keywords: ['noleggio', 'agenzia viaggi', 'tour operator', 'pulizia', 'vigilanza', 'investigazione', 'servizi imprese', 'segreteria', 'call center'],
  },
  {
    letter: 'O', label: 'Amministrazione pubblica e difesa',
    divisions: [84],
    keywords: ['pubblica amministrazione', 'difesa', 'ordine pubblico', 'sicurezza nazionale'],
  },
  {
    letter: 'P', label: 'Istruzione',
    divisions: [85],
    keywords: ['istruzione', 'scuola', 'università', 'formazione', 'educazione', 'corsi', 'insegnamento'],
  },
  {
    letter: 'Q', label: 'Sanità e assistenza sociale',
    divisions: [86, 87, 88],
    keywords: ['sanità', 'salute', 'ospedale', 'clinica', 'assistenza sociale', 'residenza anziani', 'fisioterapia', 'medico', 'dentista', 'farmacia'],
  },
  {
    letter: 'R', label: 'Attività artistiche, sportive, di intrattenimento e divertimento',
    divisions: [90, 91, 92, 93],
    keywords: ['arte', 'cultura', 'sport', 'intrattenimento', 'spettacolo', 'cinema', 'teatro', 'museo', 'palestra', 'gioco', 'scommesse', 'biblioteca'],
  },
  {
    letter: 'S', label: 'Altre attività di servizi',
    divisions: [94, 95, 96],
    keywords: ['servizi persona', 'riparazione', 'lavanderia', 'parrucchiere', 'estetista', 'associazione', 'sindacato', 'onoranze funebri'],
  },
  {
    letter: 'T', label: 'Attività di famiglie e convivenze',
    divisions: [97, 98],
    keywords: ['domestico', 'colf', 'badante', 'collaboratore domestico'],
  },
  {
    letter: 'U', label: 'Organizzazioni e organismi extraterritoriali',
    divisions: [99],
    keywords: ['extraterritoriale', 'organismo internazionale', 'ambasciata'],
  },
];

/** Division 2-digit descriptions (most used ones) */
const DIVISION_LABELS: Record<number, string> = {
  1: 'Coltivazioni agricole e produzione di prodotti animali',
  2: 'Silvicoltura ed utilizzo di aree forestali',
  3: 'Pesca e acquacoltura',
  10: 'Industrie alimentari',
  11: 'Industria delle bevande',
  13: 'Industrie tessili',
  14: 'Confezione di articoli di abbigliamento',
  15: 'Fabbricazione di articoli in pelle',
  16: 'Industria del legno',
  20: 'Fabbricazione di prodotti chimici',
  21: 'Fabbricazione di prodotti farmaceutici',
  22: 'Fabbricazione di prodotti in gomma e materie plastiche',
  23: 'Fabbricazione di altri prodotti della lavorazione di minerali non metalliferi',
  24: 'Metallurgia',
  25: 'Fabbricazione di prodotti in metallo',
  26: 'Fabbricazione di computer e prodotti di elettronica',
  27: 'Fabbricazione di apparecchiature elettriche',
  28: 'Fabbricazione di macchinari e apparecchiature nca',
  29: 'Fabbricazione di autoveicoli, rimorchi e semirimorchi',
  30: 'Fabbricazione di altri mezzi di trasporto',
  31: 'Fabbricazione di mobili',
  32: 'Altre industrie manifatturiere',
  33: 'Riparazione, manutenzione ed installazione di macchine',
  35: 'Fornitura di energia elettrica, gas, vapore',
  41: 'Costruzione di edifici',
  42: 'Ingegneria civile',
  43: 'Lavori di costruzione specializzati',
  45: 'Commercio e riparazione di autoveicoli e motocicli',
  46: 'Commercio all\'ingrosso',
  47: 'Commercio al dettaglio',
  55: 'Alloggio',
  56: 'Attività dei servizi di ristorazione',
  58: 'Attività editoriali',
  59: 'Produzione cinematografica, video, TV',
  61: 'Telecomunicazioni',
  62: 'Produzione di software, consulenza informatica',
  63: 'Attività dei servizi d\'informazione',
  64: 'Attività di servizi finanziari',
  66: 'Attività ausiliarie dei servizi finanziari',
  68: 'Attività immobiliari',
  69: 'Attività legali e contabilità',
  70: 'Attività di direzione aziendale e consulenza gestionale',
  71: 'Attività degli studi di architettura e d\'ingegneria',
  72: 'Ricerca scientifica e sviluppo',
  73: 'Pubblicità e ricerche di mercato',
  74: 'Altre attività professionali, scientifiche e tecniche',
  75: 'Servizi veterinari',
  77: 'Attività di noleggio e leasing',
  79: 'Attività dei servizi delle agenzie di viaggio e tour operator',
  85: 'Istruzione',
  86: 'Assistenza sanitaria',
  87: 'Servizi di assistenza sociale residenziale',
  88: 'Assistenza sociale non residenziale',
  90: 'Attività creative, artistiche e di intrattenimento',
  91: 'Biblioteche, archivi, musei e altre attività culturali',
  93: 'Attività sportive, di intrattenimento e di divertimento',
  95: 'Riparazione di computer e di beni per uso personale',
  96: 'Altre attività di servizi per la persona',
};

// ── Public API ──────────────────────────────────────────────────

/**
 * Extract 2-digit division from an ATECO code.
 * "55.10.00" → 55, "62" → 62, "4710" → 47
 */
export function extractDivision(code: string): number | null {
  const clean = code.replace(/\./g, '').replace(/\D/g, '');
  if (clean.length < 2) return null;
  return parseInt(clean.slice(0, 2), 10);
}

/**
 * Resolve ATECO section from a code string.
 */
export function resolveAtecoSection(code: string): AtecoSection | null {
  const div = extractDivision(code);
  if (div === null) return null;
  return ATECO_SECTIONS.find(s => s.divisions.includes(div)) ?? null;
}

/**
 * Get the label for a 2-digit division.
 */
export function getDivisionLabel(code: string): string | null {
  const div = extractDivision(code);
  if (div === null) return null;
  return DIVISION_LABELS[div] ?? null;
}

/**
 * Get sector keywords for a given ATECO code (for enriching search queries).
 */
export function getAtecoKeywords(code: string): string[] {
  const section = resolveAtecoSection(code);
  return section?.keywords ?? [];
}

/**
 * Hierarchical ATECO matching:
 *   - 6-digit exact → score 1.0
 *   - 4-digit prefix → score 0.8
 *   - 2-digit (division) → score 0.6
 *   - Same section (letter) → score 0.3
 *   - No match → score 0
 */
export function matchAtecoStructured(
  userCodes: string[],
  grantCodes: string[]
): { compatible: boolean; score: number; matchLevel: 'exact6' | 'prefix4' | 'division2' | 'section' | 'none' } {
  if (!userCodes.length || !grantCodes.length) {
    return { compatible: true, score: 0, matchLevel: 'none' };
  }

  const normalizeCode = (c: string) => c.replace(/\./g, '').replace(/\D/g, '');
  const userNorm = userCodes.map(normalizeCode).filter(c => c.length >= 2);
  const grantNorm = grantCodes.map(normalizeCode).filter(c => c.length >= 2);

  if (!userNorm.length || !grantNorm.length) {
    return { compatible: true, score: 0, matchLevel: 'none' };
  }

  // Check exact 6-digit match
  for (const u of userNorm) {
    for (const g of grantNorm) {
      if (u.length >= 6 && g.length >= 6 && u.slice(0, 6) === g.slice(0, 6)) {
        return { compatible: true, score: 1.0, matchLevel: 'exact6' };
      }
    }
  }

  // Check 4-digit prefix match
  for (const u of userNorm) {
    for (const g of grantNorm) {
      if (u.length >= 4 && g.length >= 4 && u.slice(0, 4) === g.slice(0, 4)) {
        return { compatible: true, score: 0.8, matchLevel: 'prefix4' };
      }
    }
  }

  // Check 2-digit division match
  for (const u of userNorm) {
    for (const g of grantNorm) {
      if (u.slice(0, 2) === g.slice(0, 2)) {
        return { compatible: true, score: 0.6, matchLevel: 'division2' };
      }
    }
  }

  // Check same section (letter)
  const userSections = new Set(userNorm.map(c => resolveAtecoSection(c)?.letter).filter(Boolean));
  const grantSections = new Set(grantNorm.map(c => resolveAtecoSection(c)?.letter).filter(Boolean));
  for (const us of userSections) {
    if (grantSections.has(us)) {
      return { compatible: true, score: 0.3, matchLevel: 'section' };
    }
  }

  return { compatible: false, score: 0, matchLevel: 'none' };
}

/**
 * Build ATECO-based search queries for fetching grants.
 * Returns sector keywords + division label for richer queries.
 */
export function buildAtecoSearchQueries(code: string): string[] {
  const queries: string[] = [];
  const section = resolveAtecoSection(code);
  const divLabel = getDivisionLabel(code);

  if (divLabel) queries.push(divLabel);
  if (section) {
    queries.push(section.label);
    // Add top 3 keywords for query diversity
    queries.push(...section.keywords.slice(0, 3));
  }

  return [...new Set(queries)];
}

export { ATECO_SECTIONS, DIVISION_LABELS };
