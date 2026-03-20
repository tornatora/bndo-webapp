import type { NormalizedMatchingProfile, IncentiviDoc } from '@/lib/matching/types';
import { normalizeForMatch, canonicalizeRegion } from '@/lib/matching/profileNormalizer';
import { evaluateHardEligibility, flexibleMatch } from '@/lib/matching/eligibilityEngine';

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
  | 'special' // requisiti speciali/vincoli
  | 'turnover' // fatturato annuo richiesto
  | 'regulatory' // registri speciali (Startup Innovativa)
  | 'contribution'; // preferenza di contributo

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
  consultativeAdvice: string[]; // actionable expert advice
  availabilityStatus: 'open' | 'incoming' | 'closed' | 'unknown';
  feasibilityScore: number; // 0-100 expert feasibility rating
  isClickDay?: boolean;
  isSpecialArea?: boolean;
  specialAreaType?: 'zes' | 'sisma' | 'montana' | null;
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
  subject: 15,
  territory: 20,
  purpose: 25,
  expenses: 5,
  sector: 10,
  stage: 5,
  status: 3,
  special: 2,
  turnover: 5,
  regulatory: 5,
  contribution: 5,
};

/**
 * Canoniche regioni italiane per il matching
 */
const NATIONAL_REGION_KEYWORDS = ['tutte', 'nazionale', 'italia', 'italian', 'interreg', 'coesione', 'italy'];

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
  'incentivi.gov',
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
 * Estrae una o più regioni canoniche da un testo basandosi su parole chiave e demonimi.
 */
export function detectRegionsFromText(text: string | undefined): string[] {
  if (!text) return [];
  const textNorm = normalizeForMatch(text);
  const regions: string[] = [];
  
  const regionalKeywords: Record<string, string[]> = {
    'Abruzzo': ['abruzzo', 'abruzzese', 'abruzzesi'],
    'Basilicata': ['basilicata', 'lucania', 'lucano', 'lucani'],
    'Calabria': ['calabria', 'calabrese', 'calabresi'],
    'Campania': ['campania', 'campano', 'campani', 'napoli'],
    'Emilia-Romagna': ['emilia romagna', 'emiliano', 'romagnolo', 'emiliani'],
    'Friuli-Venezia Giulia': ['friuli venezia giulia', 'fvg', 'friuli', 'giulia', 'friulano'],
    'Lazio': ['lazio', 'laziale', 'laziali', 'roma'],
    'Liguria': ['liguria', 'ligure', 'liguri', 'genova'],
    'Lombardia': ['lombardia', 'lombardo', 'lombardi', 'milano'],
    'Marche': ['marche', 'marchigiano', 'marchigiani'],
    'Molise': ['molise', 'molisano', 'molisani'],
    'Piemonte': ['piemonte', 'piemontese', 'piemontesi', 'torino'],
    'Puglia': ['puglia', 'pugliese', 'pugliesi', 'bari'],
    'Sardegna': ['sardegna', 'sardo', 'sardi', 'cagliari'],
    'Sicilia': ['sicilia', 'siciliano', 'siciliani', 'palermo', 'catania'],
    'Toscana': ['toscana', 'toscano', 'toscani', 'firenze'],
    'Trentino-Alto Adige': ['trentino alto adige', 'sudtirol', 'trento', 'bolzano'],
    'Umbria': ['umbria', 'umbro', 'umbri', 'perugia'],
    "Valle d'Aosta": ['valle d aosta', 'vallee d aoste', 'aosta'],
    'Veneto': ['veneto', 'venezia', 'veneziano', 'veneti'],
  };

  for (const [region, aliases] of Object.entries(regionalKeywords)) {
    if (aliases.some(alias => textNorm.includes(alias))) {
      regions.push(region);
    }
  }
  return regions;
}

/**
 * Valuta se un bando è compatibile con la regione dell'utente.
 * Ritorna un DimensionEval con compatibilità binaria e punteggio territoriale.
 */
export function evaluateTerritory(profile: NormalizedMatchingProfile, grant: IncentiviDoc): DimensionEval {
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
      // Se l'autorità è di una regione specifica, e non è quella dell'utente (HQ o Investimento), escludi.
      if (detectedAuthorityRegions.length > 0 && !detectedAuthorityRegions.includes(userRegion)) {
          return {
            dimension: 'territory',
            compatible: false,
            score: 0,
            confidence: 'high',
            note: `Bando territoriale riservato a ${detectedAuthorityRegions.join(', ')}`,
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
    
    // SURGICAL FIX: Se ha rilevato regioni specifiche e NESSUNA è quella dell'utente,
    // ESCLUDI anche se è un'autorità nazionale (perché è una sottomisura regionale).
    return {
      dimension: 'territory',
      compatible: false,
      score: 0,
      confidence: 'high',
      note: `Bando specifico per altri territori: ${allInferred.join(', ')}`,
    };
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
  if (userRegion) {
    return {
      dimension: 'territory',
      compatible: true,
      score: 40,
      confidence: 'low',
      note: `Territorio non specificato, ammesso con punteggio ridotto per massimizzare la visibilità`,
    };
  }

  return {
    dimension: 'territory',
    compatible: true,
    score: 50,
    confidence: 'low',
    note: 'Territorio non determinabile con certezza, ammesso con riserva',
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
      score: 70,
      confidence: 'low',
      note: 'Beneficiari non specificati (assunto aperto a tutti)',
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

  // === ADVANCED INTELLIGENCE: Company Size EU Verification ===
  if (profile.companySize) {
    const isGrandiImpreseBando = combinedText.includes('grandi imprese') || combinedText.includes('grande impresa');
    const isMicroPMIBando = combinedText.includes('pmi') || combinedText.includes('piccole e medie') || combinedText.includes('micro');
    
    // Se il profilo NON è grande impresa (es. micro/piccola/media) e il bando è SOLO per grandi imprese
    if (profile.companySize !== 'grande' && isGrandiImpreseBando && !isMicroPMIBando) {
       return {
          dimension: 'subject',
          compatible: false,
          score: 0,
          confidence: 'high',
          note: `Bando vincolato a Grandi Imprese. Profilo calcolato come ${profile.companySize}`,
        };
    }

    // Se il profilo E' grande impresa e il bando è SOLO per PMI
    if (profile.companySize === 'grande' && isMicroPMIBando && !isGrandiImpreseBando) {
       return {
          dimension: 'subject',
          compatible: false,
          score: 0,
          confidence: 'high',
          note: `Bando vincolato a Micro, Piccole e Medie Imprese (PMI). Profilo calcolato come Grande Impresa`,
        };
    }
  }

  // === ADVANCED INTELLIGENCE: Third Sector Check ===
  const isThirdSectorBando = combinedText.includes('terzo settore') || combinedText.includes('onlus') || combinedText.includes('ets') || combinedText.includes('volontariato') || combinedText.includes('cooperative sociali') || combinedText.includes('associazion');

  if (profile.isThirdSector === true) {
      if (isThirdSectorBando) {
          return {
            dimension: 'subject',
            compatible: true,
            score: 100,
            confidence: 'high',
            note: 'Bando esplicitamente dedicato agli Enti del Terzo Settore',
          };
      }
      
      const isExclusivelyImpresa = combinedText.includes('imprese') || combinedText.includes('pmi') || combinedText.includes('startup');
      if (isExclusivelyImpresa && !isThirdSectorBando) {
          return {
            dimension: 'subject',
            compatible: false,
            score: 0,
            confidence: 'high',
            note: 'Bando riservato alle Imprese, sono esclusi gli Enti Non Commerciali (Terzo Settore)',
          };
      }
  } else if (profile.isThirdSector === false) {
      if (isThirdSectorBando && !combinedText.includes('imprese') && !combinedText.includes('pmi')) {
          return {
            dimension: 'subject',
            compatible: false,
            score: 0,
            confidence: 'high',
            note: 'Bando riservato esclusivamente agli Enti del Terzo Settore',
          };
      }
  }

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

  // PRODUCTION LOCKDOWN: Negative Global Matrix (Distractor keywords)
  const distractorKeywords = [
      'estero', 'internazionalizzazione', 'export', 'insoluti', 'mancati pagamenti', 
      'crisi d impresa', 'liquidazione', 'fallimento', 'concordato', 'ristrutturazione debito',
      'cessazione', 'subentro'
  ];
  
  const titleLow = titleNorm.toLowerCase();
  const foundDistractor = distractorKeywords.find(kw => titleLow.includes(kw));
  
  // Se il bando è un distruttore (es. per l'export) e l'utente NON lo ha chiesto, escludilo chirurgicamente.
  if (foundDistractor) {
    const userWantsIt = fundingGoal.toLowerCase().includes(foundDistractor);
    if (!userWantsIt) {
        return {
          dimension: 'purpose',
          compatible: false,
          score: 0,
          confidence: 'high',
          note: `Bando dedicato a finalità specifica non richiesta: ${foundDistractor}`,
        };
    }
  }

  // --- RADICAL LEAP: PROJECT DNA ARCHETYPING ---
  const ARCHETYPES = {
    'DIGITAL': ['software', 'digital', 'piattaforma', 'informatiz', 'licenz', 'cloud', ' app ', 'sitemap', 'e-commerce', 'intelligenza artificiale', 'saas', 'cybersecurity', 'big data'],
    'GREEN': ['energet', 'energiaz', 'efficientamento', 'fotovolta', 'green', 'rinnovabil', 'caldaia', 'led', 'risparmio energetic', 'pannelli solari', 'economia circolare', 'rifiuti', 'sostenibilit', 'ecologico'],
    'EXPORT': ['export', 'fiere internazion', 'mercati esteri', 'internazion', 'branding estero', 'comunicazione estero'],
    'PRODUCTION': ['macchinar', 'attrezzatur', 'impiant', 'benistrumentali', 'veicol', 'mezzi', 'furgone', 'autovettur', 'camion', 'trattor', 'ruspa', 'muletto', 'opere murarie', 'laboratorio', 'arredi'],
    'HUMAN': ['personal', 'risorse uman', 'dipendent', 'assunzion', 'assum', 'lavor', 'occupazion', 'collaborator', 'welfar', 'formazion', 'corsi', 'academy', 'didattica', 'skill', 'competenz'],
    'INNOVATION': ['ricerc', 'svilupp', 'r&d', 'brevett', 'prototip', 'laboratorio', 'sperimentazion', 'innovazion', 'startup innovativa'],
    'EQUITY': ['equity', 'venture capital', 'business angel', 'crowdfunding', 'investitori', 'capital di rischio'],
    'OPEX': ['liquidit', 'circolante', 'stipendi', 'affitto', 'bollette', 'spese correnti', 'utenze']
  };

  const extractDNA = (text: string): string[] => {
      const dna: string[] = [];
      for (const [archetype, keywords] of Object.entries(ARCHETYPES)) {
          if (keywords.some(kw => flexibleMatch(text, kw))) {
              dna.push(archetype);
          }
      }
      return dna;
  };

  const userDNA = extractDNA(fundingGoal);
  const grantDNA = extractDNA(combinedGrantText);

  // Structural Mismatch Penalty: if user project has a specific DNA, but grant has a different, unrelated pure DNA
  if (userDNA.length > 0 && grantDNA.length > 0) {
      const hasIntersection = userDNA.some(d => grantDNA.includes(d));
      if (!hasIntersection) {
          // Pure Mismatch: User project DNA and Grant DNA are mutually exclusive
          // This is a radical filter: if I want "Green" and the bando is only "Export", it's a structural mismatch.
          return {
              dimension: 'purpose',
              compatible: false,
              score: 0,
              confidence: 'high',
              note: `Incoerenza Strutturale (DNA): Progetto [${userDNA.join(', ')}] vs Bando [${grantDNA.join(', ')}]`,
          };
      }
  }

  // Consonance Boost: 
  let dnaBonus = 0;
  if (userDNA.length > 0 && grantDNA.length > 0) {
      const intersection = userDNA.filter(d => grantDNA.includes(d));
      if (intersection.length > 0) {
          // At least one DNA archetype aligns
          dnaBonus = 20;

          // Perfection: the grant covers EVERYTHING the user wants DNA-wise
          if (userDNA.every(d => grantDNA.includes(d))) {
              dnaBonus = 30;
          }
      }
  }

  // PRODUCTION LOCKDOWN: Structural Semantic Matcher
  // If a user keyword matches a structural matrix key, any hit from that matrix keywords in the grant 
  // counts as a high-quality match for the ratio.
  const matrix: Record<string, string[]> = {
    'macchinari': ['macchinar', 'attrezzatur', 'impiant', 'benistrumentali', 'hardware', 'veicol', 'mezzi', 'furgone', ' autovettur', ' veicolo ', 'camion', 'trattor', 'ruspa', 'muletto'],
    'software': ['software', 'digitale', 'piattaforma', 'informatiz', 'licenz', 'cloud', ' app mobile', ' applicazione mobile', ' sitemap', 'e-commerce', 'svilupp', 'intelligenza artificiale', 'saas', 'cybersecurity', 'big data'],
    'sede': ['ristrutturazion', 'immobile', 'opere murarie', ' sede operativa', ' immobile sede', 'capannone', 'ufficio', 'laboratorio', 'arredi', ' showroom', ' punto vendita'],
    'assunzioni': ['personale', 'risorse umane', 'dipendenti', 'assunzion', 'assum', 'lavoro', 'occupazione', 'collaborator', 'welfare'],
    'consulenza': ['consulenza', 'specialista', 'tecnico', 'mentor', 'coach', 'professionista', 'servizi esterni', 'strategia', 'feasibility'],
    'marketing': ['marketing', 'pubblicit', 'branding', 'comunicazione', 'promozione', 'fiere', 'internazionalizz', 'export', 'internazionale', 'mercati esteri'],
    'formazione': ['formazione', 'corsi', 'academy', 'didattica', 'skill', 'competenze', 'aggiornamento'],
    'energia': ['energia', 'efficientamento', 'fotovolta', 'green', 'rinnovabil', 'caldaia', ' illuminazione led', 'risparmio energetico', 'pannelli solari'],
    'ricerca': ['ricerca', 'sviluppo', 'r&d', 'brevett', 'prototip', 'laboratorio', 'sperimentazione'],
    'liquidita': ['liquidit', 'capitale circolante', 'scorte', 'affitto', 'stipendi', 'bollette', 'debit', 'spese correnti', 'materie prime', 'utenze'],
    'equity': ['venture capital', 'business angel', 'equity crowdfunding', 'investitori', 'capitale di rischio']
  };

  // CULTURA VS COLTURA DE-CONFLICTION
  const isCulturaUser = /(cultur|creativ|artistic|museo|teatro|cinema|mostr)/i.test(fundingGoal);
  const isColturaUser = /(coltivazion|coltura|agricol|campo|vigna|orto|piantagion)/i.test(fundingGoal);
  
  if (isCulturaUser) {
      const grantHasColturaKeywords = /(coltura|coltivazion|agricol|campo|stalla|allevam)/i.test(combinedGrantText);
      if (grantHasColturaKeywords && !combinedGrantText.includes('cultur')) {
           return {
               dimension: 'purpose',
               compatible: false,
               score: 0,
               confidence: 'high',
               note: `Collisione semantica: bando agricolo (colture) non compatibile con richiesta culturale (cultura)`,
           };
      }
  }
  
  if (isColturaUser) {
      const grantHasCulturaKeywords = /(cultura|creativ|artistic|museo|mostr|cinema)/i.test(combinedGrantText);
      if (grantHasCulturaKeywords && !combinedGrantText.includes('coltur')) {
          return {
              dimension: 'purpose',
              compatible: false,
              score: 0,
              confidence: 'high',
              note: `Collisione semantica: bando culturale (cultura) non compatibile con richiesta agricola (colture)`,
          };
      }
  }

  const isOpexRequest = matrix['liquidita'].some(kw => flexibleMatch(fundingGoal, kw));
  const isCapexRequest = ['macchinari', 'software', 'sede', 'energia'].some(key => matrix[key].some(kw => flexibleMatch(fundingGoal, kw)));
  const isEquityRequest = matrix['equity'].some(kw => flexibleMatch(fundingGoal, kw));
  
  const grantAllowsOpex = titleLow.includes('liquidit') || titleLow.includes('microcredito') || combinedGrantText.includes('capitale circolante') || combinedGrantText.includes('spese correnti');
  const grantIsStrictlyCapex = /(investiment|attrezzatur|macchinar|opere murarie|beni strumentali)/i.test(combinedGrantText);

  // Hard Exclusion for Pure OPEX Requests against Pure CAPEX Grants
  if (isOpexRequest && !isCapexRequest) {
      if (grantIsStrictlyCapex && !grantAllowsOpex) {
          return {
              dimension: 'purpose',
              compatible: false,
              score: 0,
              confidence: 'high',
              note: `Richiesta esclusiva di liquidità/spese correnti in un bando destinato unicamente a investimenti (CAPEX)`,
          };
      }
  }

  let matchedKeywords = 0;
  for (const keyword of userKeywords) {
    let matched = flexibleMatch(combinedGrantText, keyword);
    
    // Semantic Expansion: if keyword belongs to a matrix category, check if grant has ANY synonym from that category
    if (!matched) {
        for (const [key, synonyms] of Object.entries(matrix)) {
            // Se la parola dell'utente (es. "assumere") contiene o è contenuta in uno dei sinonimi (es. "assum")
            // Se la parola dell'utente appartiene a questa categoria semantica
            const keywordBelongsToThisCategory = flexibleMatch(keyword, key) || flexibleMatch(key, keyword) || synonyms.some(s => flexibleMatch(keyword, s));
            
            if (keywordBelongsToThisCategory) {
                if (synonyms.some(s => flexibleMatch(combinedGrantText, s))) {
                    matched = true;
                    break;
                }
            }
        }
    }

    if (matched) {
      matchedKeywords++;
    }
  }

  const matchRatio = matchedKeywords / userKeywords.length;
  
  // Bonus point for Mixed Capex/Opex Versatile Grants
  let scoreBonus = 0;
  if (isOpexRequest && isCapexRequest && grantAllowsOpex && !grantIsStrictlyCapex) {
      scoreBonus += 20;
  }
  
  // Se abbiamo termini pesanti, almeno uno deve essere presente
  const heavyMatch = heavyKeywords.length === 0 || heavyKeywords.some(w => {
      if (flexibleMatch(combinedGrantText, w)) return true;
      // Also check semantic expansion for heavy keywords
      return Object.entries(matrix).some(([key, synonyms]) => 
          (flexibleMatch(w, key) || flexibleMatch(key, w)) && synonyms.some(s => flexibleMatch(combinedGrantText, s))
      );
  });

  // PRODUCTION LOCKDOWN: Zero-Tolerance on specific structural goals
  const structuralCheck = (goal: string, text: string) => {
    for (const [key, keywords] of Object.entries(matrix)) {
        if (flexibleMatch(goal, key)) {
        // Se il goal è specifico (es. macchinari), ma il testo NON contiene nessuna parola chiave tecnica, scarta.
        const matches = keywords.some(kw => flexibleMatch(text, kw));
        if (!matches) return { fail: true, key };
      }
    }
    return { fail: false };
  };

  const lockCheck = structuralCheck(fundingGoal, combinedGrantText);
  if (lockCheck.fail) {
      return {
        dimension: 'purpose',
        compatible: false,
        score: 0,
        confidence: 'high',
        note: `Bando non focalizzato su ${lockCheck.key} (requisito specifico mancate)`,
      };
  }

  // === ADVANCED INTELLIGENCE: Property Status Check ===
  const isRealEstate = /(ristruttur|sede|immobile|capannone|opere murari|fabbricato|locale commerciale|acquist.*immobile)/i.test(fundingGoal);
  if (isRealEstate && profile.propertyStatus === 'none') {
      return {
        dimension: 'purpose',
        compatible: false,
        score: 0,
        confidence: 'high',
        note: `Lavori edili o su immobili non agevolabili senza titolo di proprietà o locazione commerciale registrata in essere.`,
      };
  }
  const isSparseGrant = combinedGrantText.length < 400;
  const minimumMatchRatio = isSparseGrant ? 0.15 : 0.3;

  // === ADVANCED INTELLIGENCE: Tech 4.0 Check ===
  // Se il bando richiede espresamente tecnologie 4.0 o transizione 5.0 green
  const requiresTech40 = combinedGrantText.includes('4.0') || combinedGrantText.includes('industria 4') || titleLow.includes('transizione 5.0');
  let tech40Penalty = false;
  
  if (requiresTech40 && profile.tech40 === false) {
      // Seutente ha esplicitamente detto che non sono 4.0, escludiamo dal bando specifico
      return {
        dimension: 'purpose',
        compatible: false,
        score: 0,
        confidence: 'high',
        note: `Bando vincolato a tecnologie 4.0 / 5.0 non previste dal progetto`,
      };
  } else if (requiresTech40 && profile.tech40 === true) {
      // Bonus se matchano perfettamente
      matchedKeywords++; // Artificial boost
  }

  if (isCapexRequest && isOpexRequest) {
    if (scoreBonus > 0 && (combinedGrantText.includes('circolante') || combinedGrantText.includes('gestione'))) {
      // Bonus logic already handled by scoreBonus, this is just for notes
    }
  }

  // Determine Consultative Note
  let finalNote = `Corrispondenza parziale con la finalità`;
  if (matchRatio >= 0.75) finalNote = `Finalità perfettamente coerente`;
  else if (matchRatio >= 0.4) finalNote = `Finalità coerente`;

  if (dnaBonus > 0) finalNote += ` (DNA Matching Elevato)`;

  if (isOpexRequest && !isCapexRequest) {
      finalNote = `Match specifico per spese correnti e liquidità (OPEX): ${fundingGoal}`;
  } else if (isCapexRequest && !isOpexRequest) {
      finalNote = `Match specifico per investimenti in beni strumentali (CAPEX): ${fundingGoal}`;
  } else if (isCapexRequest && isOpexRequest && scoreBonus > 0) {
      finalNote = `Match strategico e versatile: il bando copre sia investimenti che spese di gestione (CAPEX+OPEX)`;
  }

  // CALCOLO PUNTEGGIO FINALE (LEAP RADICALE)
  let finalScore = Math.round(matchRatio * 100) + scoreBonus + dnaBonus;
  
  // Se c'è DNA Matching Elevato, garantiamo un minimo di punteggio per non escluderlo
  if (dnaBonus > 0) {
      // Se il DNA coincide perfettamente e il bando è dedicato (ma match ratio basso per stem errati), diamo un boost forte
      finalScore = Math.max(finalScore, 95);
  }

  // Rigore nel matching semantico per i punteggi
  if (matchRatio >= 0.75) {
    return {
      dimension: 'purpose',
      compatible: true,
      score: Math.min(100, 100 + scoreBonus + dnaBonus),
      confidence: 'high',
      note: finalNote,
    };
  }

  if (matchRatio >= 0.4 || dnaBonus > 0) {
    return {
      dimension: 'purpose',
      compatible: true,
      score: Math.min(100, finalScore),
      confidence: 'high',
      note: finalNote,
    };
  }

  // Se il match ratio è troppo basso e NON c'è DNA consonance, allora scarta
  if (!goalIsGeneric && matchRatio < minimumMatchRatio && dnaBonus === 0) {
      return {
        dimension: 'purpose',
        compatible: false,
        score: 0,
        confidence: 'high',
        note: `Incompatibile con l'obiettivo specifico (match ratio ${Math.round(matchRatio*100)}% < ${Math.round(minimumMatchRatio*100)}%): ${fundingGoal}`,
      };
  }

  return {
    dimension: 'purpose',
    compatible: goalIsGeneric || dnaBonus > 0, 
    score: Math.min(100, finalScore),
    confidence: matchRatio > 0.5 ? 'high' : 'medium',
    note: finalNote,
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
    'ristruttur', 'macchinar', 'attrezz', 'software', 'digital', 'capannone', 
    'energia', 'fotovolta', 'assunz', 'assum', 'formaz', 'export', 'internaz', 
    'brevett', 'ricerca', 'sviluppo', 'marketing', 'pubblicit', 'mezzi', 'veicoli',
    'sito', 'e-commerce', 'alberghier', 'turism', 'ristorazione', 'bar',
    'liquidit', 'stipendi', 'affitto', 'bollette', 'debiti', 'scorte'
  ];
  
  if (words.some(w => specificTerms.some(t => w.includes(t)))) return false;
  
  if (words.length <= 1) return true;
  
  const generic = [
    'bando', 'bandi', 'finanziamento', 'finanziamenti', 'contributo', 'contributi',
    'agevolazione', 'agevolazioni', 'investimento', 'investimenti', 'spese',
    'progetto', 'attivita', 'impresa', 'azienda', 'fondo perduto', 'aiuto', 'aiuti',
    'aprire', 'avviare', 'nuova', 'nuove', 'generico', 'generici', 'vari', 'altro'
  ];
  
  return words.every(w => generic.includes(w));
}

/**
 * Check if sector/activity is compatible
 */
function evaluateSector(profile: NormalizedMatchingProfile, grant: IncentiviDoc): DimensionEval {
  const userSector = profile.sector ? normalizeForMatch(profile.sector) : null;
  const userAteco = profile.ateco ? normalizeForMatch(profile.ateco) : null;
  const combinedGrantText = normalizeForMatch(`${grant.title} ${grant.description} ${grant.sectors}`);

  // Surgical Exclusion (Negative Matching)
  const exclusionKeywords = ['esclus', 'non ammess', 'non inclus', 'tranne', 'escluso il settore', 'escluse le imprese'];
  const userSectorKeywords = (profile.sector || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
  
  for (const exc of exclusionKeywords) {
      if (combinedGrantText.includes(exc)) {
          // If the exclusion context is near the user sector keyword, 0 score
          for (const kw of userSectorKeywords) {
              const kwPos = combinedGrantText.indexOf(kw);
              const excPos = combinedGrantText.indexOf(exc);
              if (kwPos !== -1 && Math.abs(kwPos - excPos) < 100) {
                  return {
                      dimension: 'sector',
                      compatible: false,
                      score: 0,
                      confidence: 'high',
                      note: `Settore ${profile.sector} esplicitamente escluso dal testo del bando`,
                  };
              }
          }
      }
  }

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
      grantAteco.some((a) => 
        a.includes(digit) || 
        a.startsWith(digit) || 
        digit.startsWith(a) // Hierarchical match: grant "62", user "62.01" -> matches
      ),
    );

    if (atecoMatch) {
      return {
        dimension: 'sector',
        compatible: true,
        score: 95,
        confidence: 'high',
        note: `Settore ATECO ${profile.atecoDigits?.[0] || ''} compatibile`,
      };
    }

    // PRODUCTION LOCKDOWN: Se abbiamo codici ATECO nel bando e nessuno matcha il profilo, ESCLUDO.
    // Non permettiamo a un match testuale di scavalcare un ATECO incompatibile.
    if (grantAteco.length > 0) {
      return {
        dimension: 'sector',
        compatible: false,
        score: 0,
        confidence: 'high',
        note: `ATECO non compatibile: bando riservato a ${grantAteco.join(', ')}`,
      };
    }
  }

  const combinedGrantSectors = grantSectors.join(' ');

  // Check sector keywords
  if (grantSectors.length > 0 && userSector) {
    const sectorKeywords = userSector.split(/\s+/).filter((w) => w.length >= 4);
    let sectorMatches = 0;

    for (const keyword of sectorKeywords) {
      if (combinedGrantSectors.includes(keyword)) {
        sectorMatches++;
      }
    }

    // Surgical Check: Clear sector mismatch
    // Se il bando ha settori espliciti (es. Turismo) e l'utente ha un settore (es. Agricoltura),
    // e non c'è NESSUNA sovrapposizione semantica, escludi.
    if (sectorKeywords.length > 0 && sectorMatches === 0) {
      return {
        dimension: 'sector',
        compatible: false,
        score: 0,
        confidence: 'high',
        note: `Settore non compatibile: bando riservato a ${grantSectors.join(', ')}`,
      };
    }

    // === ADVANCED INTELLIGENCE: Agricoltura & Albi ===
    // Agricoltura: Bandi specifici (es. ISMEA, PSR) richiedono IAP
    const isAgriBando = combinedGrantSectors.includes('agricol') || combinedGrantSectors.includes('allevament');
    if (isAgriBando && profile.agricultureStatus === 'no_land_iap') {
        return {
            dimension: 'sector',
            compatible: false,
            score: 0,
            confidence: 'high',
            note: 'Settore agricolo: mancano requisiti fondamentali (Terreni/Qualifica IAP)',
        };
    }

    // Liberi Professionisti: Bandi per professionisti iscritti
    const isProfBando = combinedGrantSectors.includes('professioni') || combinedGrantSectors.includes('ordin');
    if (isProfBando && profile.professionalRegister === false) {
        return {
            dimension: 'sector',
            compatible: false,
            score: 0,
            confidence: 'high',
            note: 'Settore professionale: richiesta iscrizione ad Albo/Ordine mancante',
        };
    }

    if (sectorKeywords.length > 0 && sectorMatches > 0) {
      return {
        dimension: 'sector',
        compatible: true,
        score: 60 + Math.round((sectorMatches / sectorKeywords.length) * 35),
        confidence: 'medium',
        note: `Settore parzialmente compatibile: ${sectorMatches}/${sectorKeywords.length}`,
      };
    }
  }

  // Cross-check: check for specific industry keywords in title vs user sector
  const industries = [
    { key: 'agricoltura', variants: ['agricol', 'coltiv', 'allevament', 'agrari', 'pesca', 'zootecn', 'vivaism', 'agritech', 'forest', 'bosco'] },
    { key: 'turismo', variants: ['turism', 'albergh', 'ricettiv', 'hotel', 'ristorazione', 'bar', 'agriturism', 'camping', 'villaggi', 'ospitalita'] },
    { key: 'industria', variants: ['manifattur', 'fabbric', 'produt', 'meccanic', 'chimic', 'plastica', 'automotive', 'elettronica', 'metalmeccanic'] },
    { key: 'artigianato', variants: ['artigian', 'laboratorio', 'bottega', 'orafo', 'ceramica', 'restauro'] },
    { key: 'commercio', variants: ['retail', 'negozio', 'e-commerce', 'shop', 'vendita', 'distribuzione', 'franchising'] },
    { key: 'edilizia', variants: ['costruzion', 'murator', 'cantier', 'ristrutturazion', 'immobiliar', 'architet', 'ingegher'] },
    { key: 'ict', variants: ['software', 'digitale', 'informatic', 'web', 'app', 'piattaforma', 'tecnolog', 'ai', 'intelligenza artificiale', 'cybersecurity', 'fintech'] },
    { key: 'servizi', variants: ['consulenza', 'formazione', 'marketing', 'comunicazione', 'professionista', 'commercialista', 'avvocato', 'fiscale'] },
    { key: 'cultura', variants: ['spettacolo', 'teatro', 'cinema', 'musica', 'museo', 'arte', 'editoria', 'libro', 'giornal'] },
    { key: 'sociale', variants: ['non profit', 'ets', 'terzo settore', 'volontariato', 'cooperativa sociale', 'onlus'] },
    { key: 'sanita', variants: ['medico', 'sanitari', 'farmacia', 'ospedalier', 'clinica', 'biotech', 'life science', 'veterinar'] },
    { key: 'ambiente', variants: ['ecolog', 'green', 'rinnovabil', 'efficientamento', 'energia', 'economia circolare', 'rifiuti', 'smaltimento'] },
    { key: 'sport', variants: ['palestra', 'sportiv', 'piscina', 'campo da', 'atleta', 'associazione sportiva'] },
    { key: 'tessile', variants: ['moda', 'fashion', 'abbigliamento', 'calzatur', 'pelle', 'cuoio', 'tessuto', 'maglieria'] },
    { key: 'chimica', variants: ['farmaceutic', 'cosmetica', 'biocidi', 'detergen', 'vetro', 'ceramica industriale'] },
    { key: 'trasporti', variants: ['logistica', 'spedizione', 'mobility', 'autotrasport'] }
  ];

  if (userSector) {
      const grantTitle = normalizeForMatch(grant.title || '');
      const userInd = industries.find(ind => userSector.includes(ind.key) || ind.variants.some(v => userSector.includes(v)));
      
      if (userInd) {
          // If user is in Industry A, but title mentions Industry B keywords, lower score or exclude
          const otherInds = industries.filter(ind => ind.key !== userInd.key);
          for (const other of otherInds) {
              if (other.variants.some(v => grantTitle.includes(v)) && !userInd.variants.some(v => grantTitle.includes(v))) {
                  // Mismatch detected in title
                  return {
                    dimension: 'sector',
                    compatible: false,
                    score: 0,
                    confidence: 'high',
                    note: `Mancata corrispondenza settore: il bando sembra dedicato a ${other.key}`,
                  };
              }
          }
      }
  }

  if (userSector && grantSectors.length > 0) {
    if (combinedGrantSectors.includes(userSector)) {
      return {
        dimension: 'sector',
        compatible: true,
        score: 85,
        confidence: 'high',
        note: 'Settore compatibile',
      };
    }
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
  const descriptionNorm = normalizeForMatch(grant.description || '');
  const titleNorm = normalizeForMatch(grant.title || '');
  const beneficiariesRaw = toStringArray(grant.beneficiaries).map((b) => normalizeForMatch(b));
  const fullText = `${titleNorm} ${descriptionNorm} ${beneficiariesRaw.join(' ')}`;
  const beneficiaries = beneficiariesRaw.join(' ');

  const currentYear = new Date().getFullYear();
  const companyAgeYears = profile.foundationYear ? currentYear - profile.foundationYear : null;

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

  const beneficiariesLocal = beneficiaries;

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
    // Check for explicit foundation year constraints in text
    if (companyAgeYears !== null) {
        if (fullText.includes('non piu di 3 anni') || fullText.includes('massimo 3 anni') || fullText.includes('36 mesi')) {
            if (companyAgeYears > 3) return { dimension: 'stage', compatible: false, score: 0, confidence: 'high', note: `Bando per startup (<3 anni), l'impresa ha ${companyAgeYears} anni` };
        }
        if (fullText.includes('non piu di 5 anni') || fullText.includes('60 mesi')) {
            if (companyAgeYears > 5) return { dimension: 'stage', compatible: false, score: 0, confidence: 'high', note: `Bando per startup (<5 anni), l'impresa ha ${companyAgeYears} anni` };
        }
        if (fullText.includes('costituite da almeno 2 anni') || fullText.includes('almeno 24 mesi')) {
            if (companyAgeYears < 2) return { dimension: 'stage', compatible: false, score: 0, confidence: 'high', note: `Richiesta anzianità minima 2 anni, l'impresa ha ${companyAgeYears} anni` };
        }
    }

    const existingFriendly = beneficiaries.includes('pmi') || beneficiaries.includes('imprese esistenti') || beneficiaries.includes('pmi consolidate');

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
    
    // Temporal Intelligence: Penalize score if it's closing extremely soon
    let score = 100;
    let confidence: 'high' | 'medium' | 'low' = 'high';
    let note = `Bando aperto, scadenza tra ${daysLeft} giorni`;
    
    if (daysLeft <= 3) {
        score = 60;
        confidence = 'medium';
        note = `Bando aperto, ma in scadenza imminente (${daysLeft} giorni)`;
    } else if (daysLeft <= 7) {
        score = 80;
        confidence = 'medium';
        note = `Bando aperto, scadenza a breve (${daysLeft} giorni)`;
    }

    return {
      dimension: 'status',
      compatible: true,
      score,
      confidence,
      note,
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
    score = 0;
  }

  // Advanced Intelligence: Project size vs Grant cap
  if (typeof costMax === 'number' && userBudget > costMax) {
    // If the budget is more than 3x the max cost, penalty
    if (userBudget > costMax * 3) {
      compatible = false;
      score = 0;
      return {
        dimension: 'expenses',
        compatible: false,
        score: 0,
        confidence: 'high',
        note: `Progetto troppo sovradimensionato (${userBudget.toLocaleString('it-IT')}€) per i limiti del bando (${costMax.toLocaleString('it-IT')}€)`,
      };
    } else {
      score = 40;
      return {
        dimension: 'expenses',
        compatible: true,
        score: 40,
        confidence: 'medium',
        note: `Budget utente (${userBudget.toLocaleString('it-IT')}€) parzialmente compatibile (tetto bando: ${costMax.toLocaleString('it-IT')}€) - possibile quota non agevolata`,
      };
    }
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
 * Evaluate contribution preference (Fondo perduto vs Finanziamento)
 */
function evaluateContributionType(profile: NormalizedMatchingProfile, grant: IncentiviDoc): DimensionEval {
  const userPref = profile.contributionPreference ? normalizeForMatch(profile.contributionPreference) : null;
  
  if (!userPref) {
    return {
      dimension: 'contribution',
      compatible: true,
      score: 50,
      confidence: 'low',
      note: 'Preferenza forma agevolazione non specificata',
    };
  }

  const supportFormRaw = grant.supportForm || '';
  const supportFormStr = Array.isArray(supportFormRaw) 
      ? supportFormRaw.map(s => normalizeForMatch(s)).join(' ') 
      : normalizeForMatch(String(supportFormRaw));

  if (!supportFormStr) {
      return {
          dimension: 'contribution',
          compatible: true,
          score: 50,
          confidence: 'medium',
          note: 'Forma di agevolazione del bando non specificata',
      };
  }

  const prefersFondoPerduto = userPref.includes('perduto') || userPref.includes('contributo diretto');
  const prefersFinanziamento = userPref.includes('finanziamento') || userPref.includes('mutuo') || userPref.includes('prestito');
  const prefersEntrambi = userPref.includes('entrambi') || userPref.includes('indifferent') || userPref.includes('tutto');

  const offersFondoPerduto = supportFormStr.includes('perduto') || supportFormStr.includes('contributo diretto') || supportFormStr.includes('conto impianti') || supportFormStr.includes('conto capitale') || normalizeForMatch(grant.title || '').includes('perduto') || normalizeForMatch(grant.description || '').includes('fondo perduto');
  const offersFinanziamento = supportFormStr.includes('finanziamento') || supportFormStr.includes('mutuo') || supportFormStr.includes('credito') || supportFormStr.includes('garanzia') || supportFormStr.includes('tasso agevolato');

  if (prefersEntrambi) {
      return {
          dimension: 'contribution',
          compatible: true,
          score: 100,
          confidence: 'high',
          note: 'Qualsiasi forma di agevolazione è ben accetta',
      };
  }

  // Se chiede SOLO fondo perduto, ma il bando offre SOLO finanziamento/garanzia, scarto drastico.
  if (prefersFondoPerduto && !prefersFinanziamento) {
      if (!offersFondoPerduto && offersFinanziamento) {
          return {
              dimension: 'contribution',
              compatible: true,
              score: 50,
              confidence: 'medium',
              note: 'Il bando non offre fondo perduto, ma un finanziamento agevolato o garanzia. Potrebbe comunque essere utile.',
          };
      }
      if (offersFondoPerduto) {
          const bonusMix = offersFinanziamento ? ' (Mix Contributo + Finanziamento)' : '';
          return {
              dimension: 'contribution',
              compatible: true,
              score: 100,
              confidence: 'high',
              note: `Tipo di contributo ideale: Fondo Perduto${bonusMix}`,
          };
      }
  }

  // Se chiede SOLO finanziamento, ma il bando offre SOLO fondo perduto (raro che si lamenti, ma per rigore)
  if (prefersFinanziamento && !prefersFondoPerduto) {
      if (!offersFinanziamento && offersFondoPerduto) {
            return {
              dimension: 'contribution',
              compatible: false,
              score: 20,
              confidence: 'high',
              note: 'Richiesto esplicitamente finanziamento restitutivo',
          };
      }
  }

  return {
      dimension: 'contribution',
      compatible: true,
      score: 70,
      confidence: 'medium',
      note: 'Forma di agevolazione parzialmente compatibile',
  };
}

/**
 * Evaluate special requirements (Youth, Female, etc.)
 */
function evaluateSpecial(profile: NormalizedMatchingProfile, grant: IncentiviDoc): DimensionEval {
  const beneficiaries = toStringArray(grant.beneficiaries).map((b) => normalizeForMatch(b));
  const titleNorm = normalizeForMatch(grant.title || '');
  const combined = `${titleNorm} ${beneficiaries.join(' ')}`;

  // 1. Youth Check (Under 35)
  const isYouthBando = combined.includes('giovan') || combined.includes('under 35') || combined.includes('u35');
  const userIsYouth = (profile.age !== null && profile.age <= 35) || profile.ageBand === 'under35' || profile.teamMajority === 'youth' || profile.teamMajority === 'mixed';

  if (isYouthBando) {
      if (userIsYouth) {
          return {
              dimension: 'special',
              compatible: true,
              score: 100,
              confidence: 'high',
              note: 'Bando premiante per imprenditoria giovanile (Under 35)',
          };
      } else if (profile.age !== null && profile.age > 35 && profile.teamMajority !== 'youth' && profile.teamMajority !== 'mixed') {
          return {
              dimension: 'special',
              compatible: false,
              score: 0,
              confidence: 'high',
              note: 'Bando riservato a soggetti under 35 o team a maggioranza giovanile',
          };
      }
  }

  // 2. Female Check (Women)
  const isFemaleBando = combined.includes('femminil') || combined.includes('donne');
  const userIsFemaleText = profile.fundingGoal?.toLowerCase().includes('femminile'); 
  const userIsFemaleTeam = profile.teamMajority === 'female' || profile.teamMajority === 'mixed';
  const userIsFemale = userIsFemaleText || userIsFemaleTeam;

  if (isFemaleBando) {
    if (userIsFemale) {
        return {
            dimension: 'special',
            compatible: true,
            score: 100,
            confidence: 'high',
            note: 'Bando premiante per imprenditoria femminile',
        };
    } else if (profile.teamMajority === 'none' || profile.teamMajority === 'youth') {
        // If they explicitly answered team majority and it's not female/mixed, they are excluded from exclusively female funds
        return {
            dimension: 'special',
            compatible: false,
            score: 0,
            confidence: 'high',
            note: 'Bando riservato a team a maggioranza femminile',
        };
    }
  }

  return {
    dimension: 'special',
    compatible: true,
    score: 50,
    confidence: 'low',
    note: 'Nessun requisito speciale prioritario',
  };
}

/**
 * Evaluate turnover requirements (SIMEST, etc.)
 */
function evaluateTurnover(profile: NormalizedMatchingProfile, grant: IncentiviDoc): DimensionEval {
    const descriptionNorm = normalizeForMatch(grant.description || '');
    const titleNorm = normalizeForMatch(grant.title || '');
    const fullText = `${titleNorm} ${descriptionNorm}`;

    // Common turnover patterns: "almeno 500.000 euro di fatturato", "minimo 100k di ricavi"
    const turnoverMinMatch = fullText.match(/(?:almeno|minimo|non inferiore a|maggiore di)\s*(?:euro)?\s*(\d+(?:[.,]\d+)?)\s*(?:k|mila|milioni|milione)?\s*(?:di)?\s*(?:fatturato|ricavi|volume d'affari)/i);
    const turnoverMaxMatch = fullText.match(/(?:massimo|non superiore a|entro|minore di)\s*(?:euro)?\s*(\d+(?:[.,]\d+)?)\s*(?:k|mila|milioni|milione)?\s*(?:di)?\s*(?:fatturato|ricavi|volume d'affari)/i);
    
    let score = 100;
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    let note = 'Requisiti di fatturato compatibili o non specificati';
    let compatible = true;

    if (turnoverMinMatch) {
        let minTurnover = parseFloat(turnoverMinMatch[1].replace(/\./g, '').replace(',', '.'));
        const multiplier = turnoverMinMatch[0].toLowerCase();
        if (multiplier.includes('k') || multiplier.includes('mila')) minTurnover *= 1000;
        else if (multiplier.includes('milion')) minTurnover *= 1000000;

        if (profile.annualTurnover === null || typeof profile.annualTurnover === 'undefined') {
             return {
                dimension: 'turnover',
                compatible: true,
                score: 50,
                confidence: 'medium',
                note: `Bando richiede fatturato min ${minTurnover.toLocaleString('it-IT')}€, ma dato mancante nel profilo`,
            };
        }

        if (profile.annualTurnover < minTurnover) {
            return {
                dimension: 'turnover',
                compatible: false,
                score: 0,
                confidence: 'high',
                note: `Fatturato insufficiente: richiesto min ${minTurnover.toLocaleString('it-IT')}€`,
            };
        }
        
        score = 100;
        confidence = 'high';
        note = `Fatturato idoneo (richiesto min ${minTurnover.toLocaleString('it-IT')}€)`;
    }

    if (turnoverMaxMatch) {
        let maxTurnover = parseFloat(turnoverMaxMatch[1].replace(/\./g, '').replace(',', '.'));
        const multiplier = turnoverMaxMatch[0].toLowerCase();
        if (multiplier.includes('k') || multiplier.includes('mila')) maxTurnover *= 1000;
        else if (multiplier.includes('milion')) maxTurnover *= 1000000;

        if (profile.annualTurnover !== null && typeof profile.annualTurnover !== 'undefined' && profile.annualTurnover > maxTurnover) {
            return {
                dimension: 'turnover',
                compatible: false,
                score: 0,
                confidence: 'high',
                note: `Fatturato eccessivo: consentito max ${maxTurnover.toLocaleString('it-IT')}€`,
            };
        }
        
        if (profile.annualTurnover === null || typeof profile.annualTurnover === 'undefined') {
             return {
                dimension: 'turnover',
                compatible: true,
                score: 50,
                confidence: 'medium',
                note: `Bando richiede fatturato max ${maxTurnover.toLocaleString('it-IT')}€, ma dato mancante nel profilo`,
            };
        }

        score = 100;
        confidence = 'high';
        note = `Fatturato idoneo (consentito max ${maxTurnover.toLocaleString('it-IT')}€)`;
    }

    return {
        dimension: 'turnover',
        compatible,
        score,
        confidence,
        note,
    };
}

/**
 * Evaluate regulatory registers (Innovative Startup, etc.)
 */
function evaluateRegulatory(profile: NormalizedMatchingProfile, grant: IncentiviDoc): DimensionEval {
    const beneficiaries = toStringArray(grant.beneficiaries).map((b) => normalizeForMatch(b));
    const titleNorm = normalizeForMatch(grant.title || '');
    const combined = `${titleNorm} ${beneficiaries.join(' ')}`;

    const isInnovativeRequired = combined.includes('innovativ') || combined.includes('sezione speciale') || combined.includes('registro speciale');
    
    if (isInnovativeRequired) {
        if (profile.isInnovative === true) {
            return {
                dimension: 'regulatory',
                compatible: true,
                score: 100,
                confidence: 'high',
                note: 'Match registro Startup/PMI Innovativa',
            };
        } else if (profile.isInnovative === false) {
            return {
                dimension: 'regulatory',
                compatible: false,
                score: 0,
                confidence: 'high',
                note: 'Bando riservato a Startup/PMI Innovative (Sezione Speciale)',
            };
        }
    }

    return {
        dimension: 'regulatory',
        compatible: true,
        score: 50,
        confidence: 'low',
        note: 'Nessun registro speciale obbligatorio rilevato',
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

  // Rule 4: Sector explicitly excluded (now hard)
  const sectorEval = evals.get('sector');
  if (sectorEval && !sectorEval.compatible) {
    return { excluded: true, reason: sectorEval.note || 'Settore non compatibile' };
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

  // Rule 7: Budget clearly incompatible
  const expensesEval = evals.get('expenses');
  if (expensesEval && !expensesEval.compatible) {
    return { excluded: true, reason: expensesEval.note || 'Budget non compatibile' };
  }

  // Rule 8: Contribution Preference incompatible
  const contributionEval = evals.get('contribution');
  if (contributionEval && !contributionEval.compatible) {
      return { excluded: true, reason: contributionEval.note || 'Forma di agevolazione non compatibile (es. Finanziamento vs Fondo Perduto)' };
  }

  return { excluded: false, reason: null };
}

/**
 * Generate human-readable explanations in Italian
 */
function generateWhyFit(evals: Map<MatchDimension, DimensionEval>): string[] {
  const reasons: string[] = [];

  const territoryEval = evals.get('territory');
  if (territoryEval && territoryEval.score >= 90) {
    reasons.push(territoryEval.note ? `📍 ${territoryEval.note}` : '📍 Territorio compatibile');
  }

  const sectorEval = evals.get('sector');
  if (sectorEval && sectorEval.score >= 90) {
    reasons.push(sectorEval.note ? `🎯 ${sectorEval.note}` : '🎯 Settore perfettamente coerente');
  }

  const purposeEval = evals.get('purpose');
  if (purposeEval && purposeEval.score >= 80) {
    reasons.push(purposeEval.note ? `🏗️ ${purposeEval.note}` : '🏗️ Finalità coerente con il progetto');
  }

  const subjectEval = evals.get('subject');
  if (subjectEval && subjectEval.score >= 85) {
    reasons.push(subjectEval.note ? `👤 ${subjectEval.note}` : '👤 Categoria beneficiario compatibile');
  }

  const expensesEval = evals.get('expenses');
  if (expensesEval && expensesEval.score >= 85) {
    reasons.push(expensesEval.note ? `💰 ${expensesEval.note}` : '💰 Budget ammissibile');
  }

  const statusEval = evals.get('status');
  if (statusEval && statusEval.score >= 90) {
    reasons.push('✅ Bando attualmente aperto');
  }

  return reasons.slice(0, 4); // Keep it concise: max 4 reasons
}

/**
 * CONSULTATIVE INTELLIGENCE: Calculate expert feasibility score (0-100)
 */
function calculateFeasibilityScore(grant: IncentiviDoc, evals: Map<MatchDimension, DimensionEval>): number {
  let score = 85; // Default "Good" baseline
  
  const title = (grant.title || '').toLowerCase();
  const desc = (grant.description || '').toLowerCase();
  
  // 1. Is it a Click Day / Sportello? (-20 penalty)
  if (title.includes('sportello') || desc.includes('sportello') || title.includes('click day')) {
    score -= 20;
  }
  
  // 2. High Coverage Benefit (+10 bonus)
  const coverage = Number(grant.coverageMaxPercent) || 0;
  if (coverage >= 80) score += 10;
  
  // 3. Deadline Pressure (-15 if < 10 days)
  if (grant.closeDate) {
    const deadline = parseDate(grant.closeDate);
    if (deadline) {
      const now = new Date();
      const diffDays = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays >= 0 && diffDays < 10) {
        score -= 15;
      }
    }
  }
  
  // 4. Mismatch risk penalty
  const poorDimensions = [...evals.values()].filter(e => e.score < 50 && e.compatible).length;
  score -= (poorDimensions * 10);
  
  return Math.max(0, Math.min(100, score));
}

/**
 * CONSULTATIVE INTELLIGENCE: Generate Expert Advice
 */
function generateExpertAdvice(grant: IncentiviDoc, evals: Map<MatchDimension, DimensionEval>, feasibility: number): string[] {
  const advice: string[] = [];
  
  const title = (grant.title || '').toLowerCase();
  const desc = (grant.description || '').toLowerCase();
  const coverage = Number(grant.coverageMaxPercent) || 0;
  
  if (feasibility < 50) {
    advice.push("⚠️ Fattibilità ridotta: i fondi a sportello o le scadenze imminenti richiedono una preparazione immediata dei documenti.");
  }
  
  if (coverage >= 80) {
    advice.push("💎 Ottima opportunità: la copertura del bando è molto elevata, riducendo l'esborso proprio.");
  }
  
  const stageEval = evals.get('stage');
  if (stageEval && stageEval.note?.includes('nuova')) {
    advice.push("🚀 Ideale per Startup: il bando ha riserve o semplificazioni per chi deve ancora avviare.");
  }

  const specialEval = evals.get('special');
  if (specialEval?.note && (specialEval.note.toLowerCase().includes('donne') || specialEval.note.toLowerCase().includes('giovani'))) {
    advice.push("✨ Vantaggio Competitivo: il tuo profilo beneficia di premialità specifiche (genere/età) previste dal bando.");
  }

  return advice.slice(0, 2);
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
function calculateTotalScore(evals: Map<MatchDimension, DimensionEval>, grant: IncentiviDoc): number {
  const title = grant.title || '';
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [dimension, dimEval] of evals.entries()) {
    const weight = DIMENSION_WEIGHTS[dimension] || 0;
    weightedSum += (dimEval.score * weight) / 100;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;
  let score = Math.round(weightedSum);

  // PRECISION REWARD: Exact sector match is a very strong signal
  const sectorEval = evals.get('sector');
  if (sectorEval && sectorEval.score >= 95) score += 10;

  // STRATEGIC BOOST: Reward measures with high grant percentage (Fondo Perduto)
  const coverage = Number(grant.coverageMaxPercent) || 0;
  const supportFormRaw = grant.supportForm || '';
  const supportFormStr = Array.isArray(supportFormRaw) ? supportFormRaw.join(' ') : String(supportFormRaw);
  const isFondoPerduto = title.toLowerCase().includes('fondo perduto') || supportFormStr.toLowerCase().includes('fondo perduto');
  
  if (isFondoPerduto) score += 10;
  if (coverage >= 80) score += 5;
  if (coverage >= 100) score += 5; // Extra for 100% coverage
  
  // STRATEGIC BOOST: Proactively promote "Resto al Sud 2.0" as a gold standard for its target
  if (grant.id === 'strategic-resto-al-sud-20' && score >= 60) {
      score += 15; // Ensure it jumps to the top
  }

  return Math.min(100, score);
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

    // 0. Hard Eligibility Engine Check (Strict Rules)
    const eligibility = evaluateHardEligibility(profile, grant);
    if (!eligibility.eligible) {
        evaluations.push({
            grantId,
            title,
            totalScore: 0,
            band: 'excluded',
            hardExcluded: true,
            hardExclusionReason: eligibility.reason,
            dimensions: [],
            whyFit: [],
            warnings: [],
            consultativeAdvice: [],
            feasibilityScore: 0,
            availabilityStatus: determineAvailabilityStatus(grant),
        });
        continue;
    }

    // Run all dimension evaluations
    const evals = new Map<MatchDimension, DimensionEval>();
    evals.set('subject', evaluateSubject(profile, grant));
    evals.set('territory', evaluateTerritory(profile, grant));
    evals.set('purpose', evaluatePurpose(profile, grant));
    evals.set('expenses', evaluateExpenses(profile, grant));
    evals.set('contribution', evaluateContributionType(profile, grant));
    evals.set('sector', evaluateSector(profile, grant));
    evals.set('stage', evaluateStage(profile, grant));
    evals.set('status', evaluateStatus(grant));
    evals.set('special', evaluateSpecial(profile, grant));
    evals.set('turnover', evaluateTurnover(profile, grant));
    evals.set('regulatory', evaluateRegulatory(profile, grant));

    // Check hard exclusions
    const hardExclusion = checkHardExclusions(profile, grant, evals);

    // Calculate total score
    const totalScore = hardExclusion.excluded ? 0 : calculateTotalScore(evals, grant);

    // Generate explanations and warnings
    const whyFit = generateWhyFit(evals);
    const warnings = generateWarnings(evals);
    const availabilityStatus = determineAvailabilityStatus(grant);
    const titleLow = (grant.title || '').toLowerCase();
    const descLow = (grant.description || '').toLowerCase();
    const isClickDay = titleLow.includes('sportello') || descLow.includes('sportello') || titleLow.includes('click day');
    const isSpecialArea = titleLow.includes('zes') || descLow.includes('zes') || titleLow.includes('sisma') || titleLow.includes('montan');
    const specialAreaType = titleLow.includes('zes') ? 'zes' : titleLow.includes('sisma') ? 'sisma' : titleLow.includes('montan') ? 'montana' : null;

    const feasibilityScore = calculateFeasibilityScore(grant, evals);
    const consultativeAdvice = generateExpertAdvice(grant, evals, feasibilityScore);

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
      consultativeAdvice,
      availabilityStatus,
      feasibilityScore,
      isClickDay,
      isSpecialArea,
      specialAreaType
    };

    evaluations.push(evaluation);
  }

  // Sort by score descending
  evaluations.sort((a, b) => b.totalScore - a.totalScore);

  // Categorize results
  const primary = evaluations.filter((e) => e.totalScore >= 75 && !e.hardExcluded).slice(0, 8);
  const borderline = evaluations.filter((e) => e.totalScore >= 65 && e.totalScore < 75 && !e.hardExcluded).slice(0, 3);
  const excluded = evaluations.filter((e) => e.totalScore < 65 || e.hardExcluded);

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
