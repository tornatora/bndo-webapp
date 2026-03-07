import type { NormalizedMatchingProfile, IncentiviDoc } from '@/lib/matching/types';
import { normalizeForMatch, canonicalizeRegion } from '@/lib/matching/profileNormalizer';

/**
 * Dimensioni di matching utilizzate nella valutazione dei bandi
 */
export type MatchDimension =
  | 'subject' // beneficiario ammissibile
  | 'territory' // territorio compatibile
  | 'purpose' // finalità reale del bisogno
  | 'expenses' // spese ammissibili
  | 'sector' // settore/attività
  | 'stage' // stadio progetto/anzianità impresa
  | 'status' // stato del bando (aperto/chiuso/in arrivo)
  | 'special'; // requisiti speciali/vincoli

/**
 * Valutazione di una singola dimensione
 */
export type DimensionEval = {
  dimension: MatchDimension;
  compatible: boolean; // hard pass/fail
  score: number; // 0-100 weighted score for this dimension
  confidence: 'high' | 'medium' | 'low';
  note: string | null; // explanation
};

/**
 * Valutazione completa di un bando
 */
export type GrantEvaluation = {
  grantId: string;
  title: string;
  totalScore: number; // 0-100 weighted
  band: 'excellent' | 'strong' | 'good' | 'borderline' | 'excluded';
  hardExcluded: boolean;
  hardExclusionReason: string | null;
  dimensions: DimensionEval[];
  whyFit: string[]; // human-readable reasons in Italian
  warnings: string[]; // residual criticalities
  availabilityStatus: 'open' | 'incoming' | 'closed' | 'unknown';
};

/**
 * Risultato della pipeline unificata
 */
export type PipelineResult = {
  evaluations: GrantEvaluation[]; // all evaluated grants
  primary: GrantEvaluation[]; // score >= 70, sorted
  borderline: GrantEvaluation[]; // 60-69, separate
  excluded: GrantEvaluation[]; // hard excluded or < 60
  totalAnalyzed: number;
  profileCompleteness: number; // 0-100
};

/**
 * Pesi per il calcolo del punteggio (devono sommare a 100)
 */
const DIMENSION_WEIGHTS: Record<MatchDimension, number> = {
  subject: 10,
  territory: 15,
  purpose: 40,
  expenses: 5,
  sector: 20,
  stage: 5,
  status: 3,
  special: 2,
};

/**
 * Canoniche regioni italiane per il matching
 */
const NATIONAL_REGION_KEYWORDS = ['tutte', 'nazionale', 'italia', 'italian', 'interreg', 'coesione'];

const NATIONAL_AUTHORITIES = [
  'invitalia',
  'ministero',
  'mimit',
  'mur',
  'masaf',
  'mite',
  'maeci',
  'agenzia delle entrate',
  'unioncamere',
  'itp',
  'ice',
  'sace',
  'simest',
  'dipartimento per la trasformazione digitale',
  'presidenza del consiglio',
];

/**
 * Parse date string to ISO format check
 */
function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Normalize array or single string to string array
 */
function toStringArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [value];
}

/**
 * Calculate profile completeness score (0-100)
 */
function calculateProfileCompleteness(profile: NormalizedMatchingProfile): number {
  const fields = [
    profile.businessExists !== null,
    profile.userRegionCanonical !== null,
    profile.sector !== null,
    profile.fundingGoal !== null,
    profile.ateco !== null,
    profile.employees !== null,
    profile.budget !== null,
  ];
  const completed = fields.filter(Boolean).length;
  return Math.round((completed / fields.length) * 100);
}

/**
 * Detect regions from text (simple implementation for unified pipeline)
 */
function detectRegionsFromText(text: string | undefined): string[] {
  if (!text) return [];
  const textNorm = normalizeForMatch(text);
  const regions: string[] = [];
  
  const regionalKeywords: Record<string, string[]> = {
    'Abruzzo': ['abruzzo'],
    'Basilicata': ['basilicata'],
    'Calabria': ['calabria'],
    'Campania': ['campania'],
    'Emilia-Romagna': ['emilia romagna'],
    'Friuli-Venezia Giulia': ['friuli venezia giulia'],
    'Lazio': ['lazio'],
    'Liguria': ['liguria'],
    'Lombardia': ['lombardia'],
    'Marche': ['marche'],
    'Molise': ['molise'],
    'Piemonte': ['piemonte'],
    'Puglia': ['puglia'],
    'Sardegna': ['sardegna'],
    'Sicilia': ['sicilia'],
    'Toscana': ['toscana'],
    'Trentino-Alto Adige': ['trentino alto adige', 'sudtirol'],
    'Umbria': ['umbria'],
    "Valle d'Aosta": ['valle d aosta', 'vallee d aoste'],
    'Veneto': ['veneto'],
  };

  for (const [region, aliases] of Object.entries(regionalKeywords)) {
    if (aliases.some(alias => textNorm.includes(alias))) {
      regions.push(region);
    }
  }
  return regions;
}

/**
 * Check if grant regions are compatible with user region
 */
function evaluateTerritory(profile: NormalizedMatchingProfile, grant: IncentiviDoc): DimensionEval {
  const userRegion = profile.userRegionCanonical || profile.region;

  if (!userRegion) {
    return {
      dimension: 'territory',
      compatible: true,
      score: 50,
      confidence: 'low',
      note: 'Regione utente non specificata',
    };
  }

  const userRegionNormalized = normalizeForMatch(userRegion);
  const grantRegions = toStringArray(grant.regions);
  const authorityName = grant.authorityName || '';
  const authorityNorm = normalizeForMatch(authorityName);
  const titleNorm = normalizeForMatch(grant.title || '');
  const combinedNorm = `${titleNorm} ${authorityNorm}`;

  // 1. Check if it's explicitly national via authority or keywords
  const isNationalAuthority = NATIONAL_AUTHORITIES.some(auth => authorityNorm.includes(auth));
  const isNationalTitle = NATIONAL_REGION_KEYWORDS.some(kw => titleNorm.includes(kw) && !titleNorm.includes('regione'));

  // 1b. Region Authority Overrule: 
  // Se l'autorità è chiaramente una Regione specifica (es. "Regione Marche"), 
  // e NON è l'autorità dell'utente, blocca subito, ignorando la lista regioni (che potrebbe essere sporca).
  if (authorityNorm.includes('regione')) {
      const detectedAuthorityRegions = detectRegionsFromText(authorityNorm);
      if (detectedAuthorityRegions.length > 0 && !detectedAuthorityRegions.includes(userRegion)) {
          return {
            dimension: 'territory',
            compatible: false,
            score: 0,
            confidence: 'high',
            note: `Bando riservato a ${detectedAuthorityRegions.join(', ')} (emesso da ${authorityName})`,
          };
      }
  }

  // 2. Se il bando specifica regioni, usale come fonte primaria
  if (grantRegions.length > 0) {
    const normalizedGrants = grantRegions.map((r) => normalizeForMatch(r));
    
    // Controlla se il bando copre tutte le regioni o è nazionale
    if (normalizedGrants.some((r) => NATIONAL_REGION_KEYWORDS.some((kw) => r.includes(kw)))) {
      return {
        dimension: 'territory',
        compatible: true,
        score: 100,
        confidence: 'high',
        note: 'Bando a copertura nazionale (esplicito)',
      };
    }

    // Controlla se la regione dell'utente è nella lista
    const foundRegion = grantRegions.find(
      (r) => normalizeForMatch(r) === userRegionNormalized || canonicalizeRegion(r) === userRegion,
    );

    if (foundRegion) {
      return {
        dimension: 'territory',
        compatible: true,
        score: 100,
        confidence: 'high',
        note: `Bando disponibile in ${userRegion}`,
      };
    }

    // Se non trovata ma è un'autorità nazionale, potremmo essere in un caso di dati incompleti
    if (isNationalAuthority && grantRegions.length > 5) {
       return {
        dimension: 'territory',
        compatible: true,
        score: 90,
        confidence: 'medium',
        note: 'Bando nazionale con lista regioni parziale',
      };
    }

    return {
      dimension: 'territory',
      compatible: false,
      score: 0,
      confidence: 'high',
      note: `Bando non disponibile in ${userRegion} (escluso da lista regioni)`,
    };
  }

  // 3. Analisi dell'autorità regionale
  if (authorityNorm.includes('regione')) {
    const detectedAuthorityRegions = detectRegionsFromText(authorityNorm);
    const isTargetRegion = authorityNorm.includes(userRegionNormalized) || detectedAuthorityRegions.includes(userRegion);
    
    if (isTargetRegion) {
      return {
        dimension: 'territory',
        compatible: true,
        score: 100,
        confidence: 'high',
        note: `Bando emesso dalla Regione ${userRegion}`,
      };
    }
    
    // Se l'autorità è di una regione diversa, ESCLUDI categoricamente
    if (detectedAuthorityRegions.length > 0 && !detectedAuthorityRegions.includes(userRegion)) {
      return {
        dimension: 'territory',
        compatible: false,
        score: 0,
        confidence: 'high',
        note: `Bando emesso da altra autorità regionale (${authorityName})`,
      };
    }
  }

  // 4. Analisi inferita dal testo (Titolo ed Ente)
  const inferredRegions = detectRegionsFromText(combinedNorm);
  
  // Aggiungi controllo demonimi nel titolo
  const regionalDemonyms: Record<string, string[]> = {
    'Abruzzo': ['abruzzese', 'abruzzesi'],
    'Basilicata': ['lucano', 'lucana', 'lucani', 'lucane'],
    'Calabria': ['calabrese', 'calabresi'],
    'Campania': ['campano', 'campana', 'campani', 'campane'],
    'Emilia-Romagna': ['emiliano', 'emiliana', 'romagnolo', 'romagnola'],
    'Friuli-Venezia Giulia': ['friulano', 'friulana', 'giuliano', 'giuliana'],
    'Lazio': ['laziale', 'laziali'],
    'Liguria': ['ligure', 'liguri'],
    'Lombardia': ['lombardo', 'lombarda', 'lombardi', 'lombarde'],
    'Marche': ['marchigiano', 'marchigiana'],
    'Molise': ['molisano', 'molisana'],
    'Piemonte': ['piemontese', 'piemontesi'],
    'Puglia': ['pugliese', 'pugliesi'],
    'Sardegna': ['sardo', 'sarda', 'sardi', 'sarde'],
    'Sicilia': ['siciliano', 'siciliana', 'siciliani', 'siciliane'],
    'Toscana': ['toscano', 'toscana'],
    'Trentino-Alto Adige': ['trentino', 'altoatesino', 'altoatesina'],
    'Umbria': ['umbro', 'umbra'],
    "Valle d'Aosta": ['valdostano', 'valdostana'],
    'Veneto': ['veneto', 'veneta', 'veneti', 'venete'],
  };

  const titleDemonyms: string[] = [];
  for (const [r, keywords] of Object.entries(regionalDemonyms)) {
      if (keywords.some(k => titleNorm.includes(k))) {
          titleDemonyms.push(r);
      }
  }

  const allInferred = Array.from(new Set([...inferredRegions, ...titleDemonyms]));

  if (allInferred.length > 0) {
    if (allInferred.includes(userRegion)) {
       return {
        dimension: 'territory',
        compatible: true,
        score: 100,
        confidence: 'medium',
        note: `Bando disponibile in ${userRegion} (rilevato da testo)`,
      };
    }
    
    // Se ha rilevato regioni specifiche e NESSUNA è quella dell'utente,
    // e NON è un'autorità nazionale fidata, escludi.
    if (!isNationalAuthority) {
        return {
          dimension: 'territory',
          compatible: false,
          score: 0,
          confidence: 'high',
          note: `Bando specifico per altri territori: ${allInferred.join(', ')}`,
        };
    }
  }

  // 5. Fallback nazionale basato su autorità fidata
  if (isNationalAuthority || isNationalTitle) {
    return {
      dimension: 'territory',
      compatible: true,
      score: 95,
      confidence: 'medium',
      note: 'Bando di rilevanza nazionale (autorità/titolo)',
    };
  }

  // 6. Se non si può dedurre nulla, NON assumere nazionale se vogliamo essere "rigorosi"
  return {
    dimension: 'territory',
    compatible: false,
    score: 0,
    confidence: 'low',
    note: 'Territorio non determinabile con certezza, escluso per rigore',
  };
}

/**
 * Check if subject/beneficiary is compatible
 */
function evaluateSubject(profile: NormalizedMatchingProfile, grant: IncentiviDoc): DimensionEval {
  const beneficiaries = toStringArray(grant.beneficiaries).map((b) => normalizeForMatch(b));
  const authorityNorm = normalizeForMatch(grant.authorityName || '');
  const titleNorm = normalizeForMatch(grant.title || '');
  const combinedText = `${titleNorm} ${authorityNorm} ${beneficiaries.join(' ')}`;

  if (beneficiaries.length === 0 && !titleNorm.includes('startup') && !titleNorm.includes('pmi')) {
    return {
      dimension: 'subject',
      compatible: true,
      score: 50,
      confidence: 'low',
      note: 'Beneficiari non specificati nel bando',
    };
  }

  // Se l'utente non ha indicato se l'azienda esiste
  if (profile.businessExists === null) {
    return {
      dimension: 'subject',
      compatible: true,
      score: 50,
      confidence: 'low',
      note: 'Stato aziendale non specificato nel profilo',
    };
  }

  // Keywords rigorose
  const startupKeywords = ['startup', 'nuova impresa', 'nuove imprese', 'da costituire', 'autoimpiego', 'auto imprenditorialita', 'nuova attivita', 'aspiranti imprenditori'];
  const existingKeywords = ['imprese gia attive', 'aziende attive', 'gia costituite', 'consolidamento', 'pmi esistenti', 'imprese esistenti', 'ampliamento'];

  const hasStartupHint = startupKeywords.some(kw => combinedText.includes(kw));
  const hasExistingHint = existingKeywords.some(kw => combinedText.includes(kw)) || combinedText.includes('pmi') && !hasStartupHint;

  // Caso Startup / Nuova Impresa
  if (!profile.businessExists) {
    if (hasStartupHint) {
      return {
        dimension: 'subject',
        compatible: true,
        score: 100,
        confidence: 'high',
        note: 'Bando specificamente rivolto a nuove imprese o startup',
      };
    }

    if (hasExistingHint && !hasStartupHint) {
       if (combinedText.includes('gia attive') || combinedText.includes('esistenti')) {
          return {
            dimension: 'subject',
            compatible: false,
            score: 0,
            confidence: 'high',
            note: 'Bando riservato a imprese già costituite',
          };
       }
    }

    return {
      dimension: 'subject',
      compatible: true,
      score: 60,
      confidence: 'medium',
      note: 'Bando potenzialmente aperto a nuove iniziative',
    };
  }

  // Caso Impresa Esistente
  if (profile.businessExists) {
    // Se il bando è SOLO per nuove imprese
    const onlyStartup = (combinedText.includes('solo startup') || combinedText.includes('solo nuove')) || 
                        (hasStartupHint && !hasExistingHint && !combinedText.includes('pmi') && !combinedText.includes('professionisti'));

    if (onlyStartup) {
      return {
        dimension: 'subject',
        compatible: false,
        score: 0,
        confidence: 'high',
        note: 'Bando riservato esclusivamente a startup o nuove imprese',
      };
    }

    if (hasExistingHint || combinedText.includes('pmi') || combinedText.includes('professionisti') || combinedText.includes('imprese')) {
      return {
        dimension: 'subject',
        compatible: true,
        score: 100,
        confidence: 'high',
        note: 'Bando compatibile con imprese già operative',
      };
    }

    return {
      dimension: 'subject',
      compatible: true,
      score: 70,
      confidence: 'medium',
      note: 'Bando potenzialmente adatto a imprese esistenti',
    };
  }

  return {
    dimension: 'subject',
    compatible: true,
    score: 50,
    confidence: 'medium',
    note: 'Compatibilità beneficiario non conclusiva',
  };
}

/**
 * Check if funding purpose is compatible
 */
function evaluatePurpose(profile: NormalizedMatchingProfile, grant: IncentiviDoc): DimensionEval {
  const fundingGoal = profile.fundingGoal ? normalizeForMatch(profile.fundingGoal) : null;

  if (!fundingGoal) {
    return {
      dimension: 'purpose',
      compatible: true,
      score: 50,
      confidence: 'low',
      note: 'Finalità di finanziamento non specificata',
    };
  }

  const purposes = toStringArray(grant.purposes).map((p) => normalizeForMatch(p));
  const titleNorm = normalizeForMatch(grant.title || '');
  const descriptionNorm = normalizeForMatch(grant.description || '').slice(0, 1200);
  const combinedGrantText = `${titleNorm} ${purposes.join(' ')} ${descriptionNorm}`;

  // Keywords del profilo utente
  const userKeywords = fundingGoal
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  const goalIsGeneric = isGenericFundingGoal(fundingGoal);

  if (userKeywords.length === 0) {
    return {
      dimension: 'purpose',
      compatible: true,
      score: 50,
      confidence: 'low',
      note: 'Finalità utente troppo generica',
    };
  }

  // Identifica i termini "pesanti" (es. ristrutturazione, software, macchinari)
  const heavyKeywords = userKeywords.filter(w => 
    w.length >= 5 && !['azienda', 'impresa', 'nuova', 'attivita', 'progetto'].includes(w)
  );

  // Check for negative matches (India, Foreign countries, failed payments)
  const negativeKeywords = ['india', 'estero', 'internazionalizzazione', 'export', 'insoluti', 'mancati pagamenti', 'crisi d impresa', 'liquidazione'];
  const hasNegativeKeyword = negativeKeywords.some(kw => titleNorm.includes(kw));
  
  const userMentionsNegative = negativeKeywords.some(kw => fundingGoal.includes(kw));
  
  if (hasNegativeKeyword && !userMentionsNegative) {
      return {
        dimension: 'purpose',
        compatible: false,
        score: 0,
        confidence: 'high',
        note: `Bando escluso: finalità specifica non richiesta (es. estero/crisi)`,
      };
  }

  let matchedKeywords = 0;
  for (const keyword of userKeywords) {
    if (combinedGrantText.includes(keyword)) {
      matchedKeywords++;
    }
  }

  const matchRatio = matchedKeywords / userKeywords.length;
  
  // Se abbiamo termini pesanti, almeno uno deve essere presente
  const heavyMatch = heavyKeywords.length === 0 || heavyKeywords.some(w => combinedGrantText.includes(w));

  // LOGICA DI RIGORE MASSIMO
  if (!goalIsGeneric) {
      // Se non c'è match sui termini pesanti o il ratio è troppo basso, escludi
      if (!heavyMatch || matchRatio < 0.5) {
          return {
            dimension: 'purpose',
            compatible: false,
            score: 0,
            confidence: 'high',
            note: `Incompatibile con l'obiettivo specifico: ${fundingGoal}`,
          };
      }
  }

  // Rigore nel matching semantico per i punteggi
  if (matchRatio >= 0.75) {
    return {
      dimension: 'purpose',
      compatible: true,
      score: 100,
      confidence: 'high',
      note: `Finalità perfettamente coerente`,
    };
  }

  if (matchRatio >= 0.4) {
    return {
      dimension: 'purpose',
      compatible: true,
      score: 80,
      confidence: 'high',
      note: `Finalità coerente`,
    };
  }

  return {
    dimension: 'purpose',
    compatible: goalIsGeneric, 
    score: Math.round(matchRatio * 100),
    confidence: 'medium',
    note: `Corrispondenza parziale con la finalità`,
  };
}

/**
 * Helper to determine if a goal is too generic
 */
function isGenericFundingGoal(text: string) {
  const n = normalizeForMatch(text);
  if (!n) return true;
  const words = n.split(' ').filter(w => w.length >= 3);
  
  // Se contiene parole ad alto valore semantico non è generico
  const specificTerms = [
    'ristruttur', 'macchinar', 'software', 'digitalizz', 'hardware', 'impiant', 
    'fotovolta', 'turismo', 'alberghier', 'ristorazione', 'bar', 'commercio',
    'e-commerce', 'export', 'internazionalizz', 'assunzion', 'personale',
    'ricerca', 'sviluppo', 'innovazione', 'brevett', 'certificazion'
  ];
  
  if (words.some(w => specificTerms.some(t => w.includes(t)))) return false;
  
  if (words.length <= 1) return true;
  
  const generic = [
    'bando', 'bandi', 'finanziamento', 'finanziamenti', 'contributo', 'contributi',
    'agevolazione', 'agevolazioni', 'investimento', 'investimenti', 'spese',
    'progetto', 'attivita', 'impresa', 'azienda', 'fondo perduto', 'aiuto', 'aiuti',
    'aprire', 'avviare', 'nuova', 'nuove'
  ];
  
  return words.every(w => generic.includes(w));
}

/**
 * Check if sector/activity is compatible
 */
function evaluateSector(profile: NormalizedMatchingProfile, grant: IncentiviDoc): DimensionEval {
  const userSector = profile.sector ? normalizeForMatch(profile.sector) : null;
  const userAteco = profile.ateco ? normalizeForMatch(profile.ateco) : null;

  if (!userSector && !userAteco) {
    return {
      dimension: 'sector',
      compatible: true,
      score: 50,
      confidence: 'low',
      note: 'Settore non specificato nel profilo',
    };
  }

  const grantSectors = toStringArray(grant.sectors).map((s) => normalizeForMatch(s));
  const grantAteco = toStringArray(grant.ateco).map((a) => normalizeForMatch(a));

  if (grantSectors.length === 0 && grantAteco.length === 0) {
    return {
      dimension: 'sector',
      compatible: true,
      score: 50,
      confidence: 'medium',
      note: 'Settore non specificato nel bando',
    };
  }

  // Check ATECO digits (prima 2, poi 4, poi 6)
  if (profile.atecoDigits && profile.atecoDigits.length > 0) {
    const atecoMatch = profile.atecoDigits.some((digit) =>
      grantAteco.some((a) => a.includes(digit) || a.startsWith(digit)),
    );

    if (atecoMatch) {
      return {
        dimension: 'sector',
        compatible: true,
        score: 95,
        confidence: 'high',
        note: 'Settore ATECO compatibile',
      };
    }
  }

  // Check sector keywords
  const combinedGrantSectors = grantSectors.join(' ');

  if (userSector && combinedGrantSectors.includes(userSector)) {
    return {
      dimension: 'sector',
      compatible: true,
      score: 85,
      confidence: 'high',
      note: 'Settore compatibile',
    };
  }

  // Partial match with sector keywords
  const sectorKeywords = userSector?.split(/\s+/).filter((w) => w.length >= 4) || [];
  let sectorMatches = 0;

  for (const keyword of sectorKeywords) {
    if (combinedGrantSectors.includes(keyword)) {
      sectorMatches++;
    }
  }

  if (sectorKeywords.length > 0 && sectorMatches > 0) {
    return {
      dimension: 'sector',
      compatible: true,
      score: 60,
      confidence: 'medium',
      note: `Settore parzialmente compatibile: ${sectorMatches}/${sectorKeywords.length}`,
    };
  }

  return {
    dimension: 'sector',
    compatible: true,
    score: 40,
    confidence: 'low',
    note: 'Settore non chiaramente compatibile',
  };
}

/**
 * Check if business stage/age is compatible
 */
function evaluateStage(profile: NormalizedMatchingProfile, grant: IncentiviDoc): DimensionEval {
  // Se lo stato aziendale non è noto, score neutro
  if (profile.businessExists === null) {
    return {
      dimension: 'stage',
      compatible: true,
      score: 50,
      confidence: 'low',
      note: 'Stato aziendale non specificato',
    };
  }

  const beneficiaries = toStringArray(grant.beneficiaries)
    .map((b) => normalizeForMatch(b))
    .join(' ');

  // Se l'utente è startup, controllare se il bando le accetta
  if (!profile.businessExists) {
    const startupFriendly =
      beneficiaries.includes('startup') ||
      beneficiaries.includes('nuova impresa') ||
      beneficiaries.includes('autoimpiego');

    if (startupFriendly) {
      return {
        dimension: 'stage',
        compatible: true,
        score: 95,
        confidence: 'high',
        note: 'Bando adatto a startup',
      };
    }

    const onlyExisting = beneficiaries.includes('gia attiva') || beneficiaries.includes('pmi consolidate');
    if (onlyExisting) {
      return {
        dimension: 'stage',
        compatible: false,
        score: 0,
        confidence: 'high',
        note: 'Bando riservato a imprese già costituite',
      };
    }

    return {
      dimension: 'stage',
      compatible: true,
      score: 60,
      confidence: 'medium',
      note: 'Compatibilità stadio aziendale incerta per startup',
    };
  }

  // Se l'utente ha un'impresa esistente
  if (profile.businessExists) {
    const existingFriendly = beneficiaries.includes('pmi') || beneficiaries.includes('imprese esistenti');

    if (existingFriendly) {
      return {
        dimension: 'stage',
        compatible: true,
        score: 90,
        confidence: 'high',
        note: 'Bando adatto a imprese già costituite',
      };
    }

    const onlyStartup = beneficiaries.includes('solo startup') || beneficiaries.includes('solo nuova impresa');
    if (onlyStartup) {
      return {
        dimension: 'stage',
        compatible: false,
        score: 0,
        confidence: 'high',
        note: 'Bando riservato a startup',
      };
    }

    return {
      dimension: 'stage',
      compatible: true,
      score: 70,
      confidence: 'medium',
      note: 'Bando potenzialmente adatto a imprese esistenti',
    };
  }

  return {
    dimension: 'stage',
    compatible: true,
    score: 50,
    confidence: 'low',
    note: 'Compatibilità stadio aziendale non valutabile',
  };
}

/**
 * Evaluate grant status (open, incoming, closed)
 */
function evaluateStatus(grant: IncentiviDoc): DimensionEval {
  const openDate = parseDate(grant.openDate as string);
  const closeDate = parseDate(grant.closeDate as string);
  const now = new Date();

  if (!openDate && !closeDate) {
    return {
      dimension: 'status',
      compatible: true,
      score: 50,
      confidence: 'low',
      note: 'Date di apertura/chiusura non disponibili',
    };
  }

  // Check if bando is closed
  if (closeDate && closeDate < now) {
    return {
      dimension: 'status',
      compatible: false,
      score: 0,
      confidence: 'high',
      note: `Bando scaduto il ${closeDate.toLocaleDateString('it-IT')}`,
    };
  }

  // Check if bando is incoming
  if (openDate && openDate > now) {
    return {
      dimension: 'status',
      compatible: true,
      score: 70,
      confidence: 'high',
      note: `Bando in arrivo dal ${openDate.toLocaleDateString('it-IT')}`,
    };
  }

  // Bando is open
  if (openDate && closeDate && openDate <= now && closeDate > now) {
    const daysLeft = Math.ceil((closeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return {
      dimension: 'status',
      compatible: true,
      score: 100,
      confidence: 'high',
      note: `Bando aperto, scadenza tra ${daysLeft} giorni`,
    };
  }

  return {
    dimension: 'status',
    compatible: true,
    score: 80,
    confidence: 'medium',
    note: 'Stato del bando compatibile',
  };
}

/**
 * Evaluate expenses compatibility
 */
function evaluateExpenses(profile: NormalizedMatchingProfile, grant: IncentiviDoc): DimensionEval {
  const userBudget = profile.budget;
  const costMin = typeof grant.costMin === 'string' ? Number.parseFloat(grant.costMin) : grant.costMin;
  const costMax = typeof grant.costMax === 'string' ? Number.parseFloat(grant.costMax) : grant.costMax;

  if (!userBudget && typeof costMin === 'undefined' && typeof costMax === 'undefined') {
    return {
      dimension: 'expenses',
      compatible: true,
      score: 50,
      confidence: 'low',
      note: 'Budget non specificati',
    };
  }

  if (!userBudget) {
    return {
      dimension: 'expenses',
      compatible: true,
      score: 50,
      confidence: 'low',
      note: 'Budget utente non specificato',
    };
  }

  if (typeof costMin === 'undefined' && typeof costMax === 'undefined') {
    return {
      dimension: 'expenses',
      compatible: true,
      score: 50,
      confidence: 'medium',
      note: 'Budget del bando non specificati',
    };
  }

  // Check if user budget is within range
  let compatible = true;
  let score = 75;

  if (typeof costMin === 'number' && userBudget < costMin) {
    compatible = false;
    score = 10;
  }

  if (typeof costMax === 'number' && userBudget > costMax) {
    compatible = false;
    score = 10;
  }

  if (compatible) {
    return {
      dimension: 'expenses',
      compatible: true,
      score: 90,
      confidence: 'high',
      note: `Budget compatibile: ${userBudget.toLocaleString('it-IT')} €`,
    };
  }

  return {
    dimension: 'expenses',
    compatible: false,
    score: 0,
    confidence: 'high',
    note: `Budget non compatibile: ${userBudget.toLocaleString('it-IT')} € vs range bando`,
  };
}

/**
 * Evaluate special requirements
 */
function evaluateSpecial(_profile: NormalizedMatchingProfile, _grant: IncentiviDoc): DimensionEval {
  // Reserved for future special requirements evaluation
  return {
    dimension: 'special',
    compatible: true,
    score: 50,
    confidence: 'low',
    note: 'Valutazione requisiti speciali non ancora implementata',
  };
}

/**
 * Determine availability status
 */
function determineAvailabilityStatus(grant: IncentiviDoc): 'open' | 'incoming' | 'closed' | 'unknown' {
  const openDate = parseDate(grant.openDate as string);
  const closeDate = parseDate(grant.closeDate as string);
  const now = new Date();

  if (!openDate && !closeDate) {
    return 'unknown';
  }

  if (closeDate && closeDate < now) {
    return 'closed';
  }

  if (openDate && openDate > now) {
    return 'incoming';
  }

  return 'open';
}

/**
 * Check hard exclusion rules
 */
function checkHardExclusions(
  profile: NormalizedMatchingProfile,
  grant: IncentiviDoc,
  evals: Map<MatchDimension, DimensionEval>,
): { excluded: boolean; reason: string | null } {
  // Rule 1: Subject incompatible
  const subjectEval = evals.get('subject');
  if (subjectEval && !subjectEval.compatible) {
    return { excluded: true, reason: subjectEval.note || 'Beneficiario non ammissibile' };
  }

  // Rule 2: Territory incompatible
  const territoryEval = evals.get('territory');
  if (territoryEval && !territoryEval.compatible) {
    return { excluded: true, reason: territoryEval.note || 'Territorio non compatibile' };
  }

  // Rule 3: Purpose substantially incompatible
  const purposeEval = evals.get('purpose');
  if (purposeEval && !purposeEval.compatible) {
    return { excluded: true, reason: purposeEval.note || 'Finalità non compatibile' };
  }

  // Rule 4: Sector explicitly excluded
  const sectorEval = evals.get('sector');
  if (sectorEval && !sectorEval.compatible) {
    // Note: sector eval returns compatible=true with low score, not hard exclude
    // This is intentional - sector mismatch is soft, not hard
  }

  // Rule 5: Stage/phase incompatible
  const stageEval = evals.get('stage');
  if (stageEval && !stageEval.compatible) {
    return { excluded: true, reason: stageEval.note || 'Stadio aziendale non compatibile' };
  }

  // Rule 6: Status incompatible (closed bando)
  const statusEval = evals.get('status');
  if (statusEval && !statusEval.compatible) {
    return { excluded: true, reason: statusEval.note || 'Bando scaduto o non disponibile' };
  }

  return { excluded: false, reason: null };
}

/**
 * Generate human-readable explanations in Italian
 */
function generateWhyFit(evals: Map<MatchDimension, DimensionEval>): string[] {
  const reasons: string[] = [];

  const subjectEval = evals.get('subject');
  if (subjectEval && subjectEval.score >= 85) {
    reasons.push(subjectEval.note || 'Categoria beneficiario compatibile');
  }

  const territoryEval = evals.get('territory');
  if (territoryEval && territoryEval.score >= 90) {
    reasons.push(territoryEval.note || 'Territorio compatibile');
  }

  const purposeEval = evals.get('purpose');
  if (purposeEval && purposeEval.score >= 80) {
    reasons.push(purposeEval.note || 'Finalità coerente con il progetto');
  }

  const sectorEval = evals.get('sector');
  if (sectorEval && sectorEval.score >= 80) {
    reasons.push(sectorEval.note || 'Settore attività compatibile');
  }

  const stageEval = evals.get('stage');
  if (stageEval && stageEval.score >= 85) {
    reasons.push(stageEval.note || 'Stadio aziendale adatto');
  }

  const statusEval = evals.get('status');
  if (statusEval && statusEval.score >= 90) {
    reasons.push(statusEval.note || 'Bando disponibile');
  }

  const expensesEval = evals.get('expenses');
  if (expensesEval && expensesEval.score >= 85) {
    reasons.push(expensesEval.note || 'Budget ammissibile');
  }

  return reasons.length > 0 ? reasons : ['Bando con requisiti generali compatibili'];
}

/**
 * Generate warnings for low-confidence evaluations
 */
function generateWarnings(evals: Map<MatchDimension, DimensionEval>): string[] {
  const warnings: string[] = [];

  for (const dimEval of evals.values()) {
    if (dimEval.confidence === 'low' && dimEval.score > 0 && dimEval.score < 100) {
      warnings.push(`Bassa affidabilità valutazione ${dimEval.dimension}: ${dimEval.note || 'dati incompleti'}`);
    }
  }

  return warnings;
}

/**
 * Calculate weighted total score from dimension evaluations
 */
function calculateTotalScore(evals: Map<MatchDimension, DimensionEval>): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [dimension, dimEval] of evals.entries()) {
    const weight = DIMENSION_WEIGHTS[dimension] || 0;
    weightedSum += (dimEval.score * weight) / 100;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round(weightedSum);
}

/**
 * Determine band based on total score
 */
function determineBand(score: number): GrantEvaluation['band'] {
  if (score >= 90) return 'excellent';
  if (score >= 80) return 'strong';
  if (score >= 70) return 'good';
  if (score >= 60) return 'borderline';
  return 'excluded';
}

/**
 * Main unified matching pipeline
 */
export function runUnifiedPipeline(args: {
  profile: NormalizedMatchingProfile;
  grants: IncentiviDoc[];
  options?: {
    channel?: 'chat' | 'scanner';
    strictness?: 'standard' | 'high';
    maxResults?: number;
  };
}): PipelineResult {
  const { profile, grants } = args;
  const options = args.options || {};

  // Evaluate all grants
  const evaluations: GrantEvaluation[] = [];

  for (const grant of grants) {
    const grantId = String(grant.id ?? '');
    const title = grant.title ?? 'Unknown Grant';

    // Run all dimension evaluations
    const evals = new Map<MatchDimension, DimensionEval>();
    evals.set('subject', evaluateSubject(profile, grant));
    evals.set('territory', evaluateTerritory(profile, grant));
    evals.set('purpose', evaluatePurpose(profile, grant));
    evals.set('expenses', evaluateExpenses(profile, grant));
    evals.set('sector', evaluateSector(profile, grant));
    evals.set('stage', evaluateStage(profile, grant));
    evals.set('status', evaluateStatus(grant));
    evals.set('special', evaluateSpecial(profile, grant));

    // Check hard exclusions
    const hardExclusion = checkHardExclusions(profile, grant, evals);

    // Calculate total score
    const totalScore = hardExclusion.excluded ? 0 : calculateTotalScore(evals);

    // Generate explanations and warnings
    const whyFit = generateWhyFit(evals);
    const warnings = generateWarnings(evals);
    const availabilityStatus = determineAvailabilityStatus(grant);

    const evaluation: GrantEvaluation = {
      grantId,
      title,
      totalScore,
      band: determineBand(totalScore),
      hardExcluded: hardExclusion.excluded,
      hardExclusionReason: hardExclusion.reason,
      dimensions: [...evals.values()],
      whyFit,
      warnings,
      availabilityStatus,
    };

    evaluations.push(evaluation);
  }

  // Sort by score descending
  evaluations.sort((a, b) => b.totalScore - a.totalScore);

  // Categorize results
  const primary = evaluations.filter((e) => e.totalScore >= 70);
  const borderline = evaluations.filter((e) => e.totalScore >= 60 && e.totalScore < 70);
  const excluded = evaluations.filter((e) => e.totalScore < 60);

  // Apply maxResults limit if specified
  const maxResults = options.maxResults;
  if (maxResults && maxResults > 0) {
    primary.splice(maxResults);
  }

  const profileCompleteness = calculateProfileCompleteness(profile);

  return {
    evaluations,
    primary,
    borderline,
    excluded,
    totalAnalyzed: grants.length,
    profileCompleteness,
  };
}
