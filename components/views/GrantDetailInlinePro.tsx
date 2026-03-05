'use client';

import { useEffect, useState } from 'react';
import { ProgressBarPro as ProgressBar } from '@/components/views/ProgressBarPro';

interface GrantDetail {
  id: string;
  title: string;
  authority: string | null;
  openingDate: string | null;
  deadlineDate: string | null;
  availabilityStatus: 'open' | 'incoming';
  budgetTotal: number | null;
  aidForm: string | null;
  aidIntensity: string | null;
  beneficiaries: string[];
  sectors: string[];
  officialUrl: string;
  officialAttachments: string[];
  requisitiHard: Record<string, unknown>;
  requisitiSoft: Record<string, unknown>;
  requisitiStrutturati: Record<string, unknown>;
}

interface Explainability {
  hardStatus: 'eligible' | 'not_eligible' | 'unknown';
  eligibilityScore: number;
  completenessScore: number;
  fitScore: number;
  probabilityScore: number;
  whyFit: string[];
  satisfiedRequirements: string[];
  missingRequirements: string[];
  applySteps: string[];
  message?: string;
}

const CONSULTING_EMAIL = process.env.NEXT_PUBLIC_CONSULTING_EMAIL || 'admin@grants.local';
const CONSULTING_URL = process.env.NEXT_PUBLIC_CONSULTING_URL || '';

const formatDate = (value: string | null, fallback: string) => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString('it-IT');
};

const formatMoney = (value: number | null): string => {
  if (value === null || !Number.isFinite(value) || value <= 0) return 'Dati economici in aggiornamento';
  return `€ ${Math.round(value).toLocaleString('it-IT')}`;
};

const toNumeric = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/\./g, '').replace(',', '.').trim();
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const formatMoneyRange = (min: number | null, max: number | null): string | null => {
  if (min !== null && max !== null) {
    if (Math.abs(min - max) < 1) return formatMoney(max);
    return `Da ${formatMoney(min)} a ${formatMoney(max)}`;
  }
  if (max !== null) return `Fino a ${formatMoney(max)}`;
  if (min !== null) return `Da ${formatMoney(min)}`;
  return null;
};

const formatPercentRange = (min: number | null, max: number | null): string | null => {
  const safeMin = min !== null && Number.isFinite(min) && min > 0 ? Math.max(1, Math.min(100, min)) : null;
  const safeMax = max !== null && Number.isFinite(max) && max > 0 ? Math.max(1, Math.min(100, max)) : null;
  if (safeMin !== null && safeMax !== null) {
    const low = Math.round(Math.min(safeMin, safeMax));
    const high = Math.round(Math.max(safeMin, safeMax));
    return low === high ? `${high}%` : `${low}% - ${high}%`;
  }
  if (safeMax !== null) return `${Math.round(safeMax)}%`;
  if (safeMin !== null) return `${Math.round(safeMin)}%`;
  return null;
};

const parseCoverageRange = (
  label: string | null | undefined,
  structuredEconomic: Record<string, unknown> | undefined,
): { min: number | null; max: number | null } => {
  const fromMin = toNumeric(structuredEconomic?.estimatedCoverageMinPercent);
  const fromMax = toNumeric(structuredEconomic?.estimatedCoverageMaxPercent);
  if (fromMin !== null || fromMax !== null) {
    return { min: fromMin ?? fromMax, max: fromMax ?? fromMin };
  }

  const raw = typeof label === 'string' ? label : '';
  const matches = Array.from(raw.matchAll(/(\d{1,3}(?:[.,]\d+)?)\s*%/g))
    .map((match) => Number(match[1].replace(',', '.')))
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 100);
  if (!matches.length) {
    return { min: null, max: null };
  }
  return {
    min: Math.min(...matches),
    max: Math.max(...matches),
  };
};

const economicSummaryFromDetail = (detail: GrantDetail): { grantAmount: string; coverage: string; projectAmount: string } => {
  const structuredEconomic =
    detail.requisitiStrutturati && typeof detail.requisitiStrutturati === 'object'
      ? (detail.requisitiStrutturati.economic as Record<string, unknown> | undefined)
      : undefined;
  const displayAmountLabel =
    typeof structuredEconomic?.displayAmountLabel === 'string' && structuredEconomic.displayAmountLabel.trim()
      ? structuredEconomic.displayAmountLabel.trim()
      : null;
  const displayProjectAmountLabel =
    typeof structuredEconomic?.displayProjectAmountLabel === 'string' && structuredEconomic.displayProjectAmountLabel.trim()
      ? structuredEconomic.displayProjectAmountLabel.trim()
      : null;
  const displayCoverageLabel =
    typeof structuredEconomic?.displayCoverageLabel === 'string' && structuredEconomic.displayCoverageLabel.trim()
      ? structuredEconomic.displayCoverageLabel.trim()
      : null;

  const grantMin = toNumeric(structuredEconomic?.grantMin);
  const grantMax = toNumeric(structuredEconomic?.grantMax);
  const costMin = toNumeric(structuredEconomic?.costMin);
  const costMax = toNumeric(structuredEconomic?.costMax);
  const budgetAllocation = toNumeric(structuredEconomic?.budgetAllocation);
  const rawCoverageLabel =
    displayCoverageLabel ||
    (typeof structuredEconomic?.estimatedCoverageLabel === 'string' && structuredEconomic.estimatedCoverageLabel.trim()) ||
    detail.aidIntensity ||
    null;
  const coverageRange = parseCoverageRange(rawCoverageLabel, structuredEconomic);
  const inferredGrantFromCostMin =
    costMin !== null && coverageRange.min !== null ? (costMin * coverageRange.min) / 100 : null;
  const inferredGrantFromCostMax =
    costMax !== null && coverageRange.max !== null ? (costMax * coverageRange.max) / 100 : null;

  let grantOutMin = grantMin ?? inferredGrantFromCostMin;
  let grantOutMax = grantMax ?? inferredGrantFromCostMax;
  if (grantOutMin === null && detail.budgetTotal && coverageRange.min !== null) {
    grantOutMin = (detail.budgetTotal * coverageRange.min) / 100;
  }
  if (grantOutMax === null && detail.budgetTotal && coverageRange.max !== null) {
    grantOutMax = (detail.budgetTotal * coverageRange.max) / 100;
  }

  const values = [grantMin, grantMax, costMin, costMax].filter(
    (value): value is number => value !== null && Number.isFinite(value) && value > 0,
  );
  const hasOnlyTinyEconomicValues = values.length > 0 && Math.max(...values) < 5000;

  const computedGrantAmount =
    !hasOnlyTinyEconomicValues
      ? formatMoneyRange(grantOutMin, grantOutMax) ??
        (detail.budgetTotal ? `Fino a ${formatMoney(detail.budgetTotal)}` : budgetAllocation ? `Fino a ${formatMoney(budgetAllocation)}` : 'Dati economici in aggiornamento')
      : detail.budgetTotal
        ? `Fino a ${formatMoney(detail.budgetTotal)}`
        : budgetAllocation
          ? `Fino a ${formatMoney(budgetAllocation)}`
          : 'Dati economici in aggiornamento';
  const coverage = rawCoverageLabel || formatPercentRange(coverageRange.min, coverageRange.max) || 'Copertura in aggiornamento';
  const computedProjectAmount = !hasOnlyTinyEconomicValues
    ? formatMoneyRange(costMin, costMax) ?? (detail.budgetTotal ? `Fino a ${formatMoney(detail.budgetTotal)}` : 'Dati economici in aggiornamento')
    : detail.budgetTotal
      ? `Fino a ${formatMoney(detail.budgetTotal)}`
      : 'Dati economici in aggiornamento';

  const projectAmount = displayProjectAmountLabel || computedProjectAmount;
  const grantAmount = displayAmountLabel || computedGrantAmount || projectAmount;

  return { grantAmount, coverage, projectAmount };
};

const buildConsultingLink = (grantId: string, grantTitle: string, officialUrl: string): string => {
  if (CONSULTING_URL) {
    try {
      const url = new URL(CONSULTING_URL);
      url.searchParams.set('grantId', grantId);
      url.searchParams.set('bando', grantTitle);
      return url.toString();
    } catch {
      return CONSULTING_URL;
    }
  }

  const subject = encodeURIComponent(`Prenotazione consulenza bando: ${grantTitle}`);
  const body = encodeURIComponent(
    `Ciao, vorrei prenotare una consulenza per questo bando:\n${grantTitle}\nLink ufficiale: ${officialUrl}`,
  );
  return `mailto:${CONSULTING_EMAIL}?subject=${subject}&body=${body}`;
};

const oneLine = (items: string[] | undefined, fallback: string, take = 3): string => {
  const values = (items ?? []).map((value) => String(value).trim()).filter(Boolean).slice(0, take);
  if (values.length === 0) return fallback;
  return values.join(' · ');
};

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const toStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
};

const formatSectorSummary = (sectors: string[], excludedSectors: string[], forceAllSectors: boolean): string => {
  const excludedNormalized = new Set(excludedSectors.map((item) => normalizeText(item)));
  const cleaned = sectors
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !excludedNormalized.has(normalizeText(item)));

  if (forceAllSectors) {
    if (excludedSectors.length > 0) {
      return `Tutti i settori economici (esclusi ${excludedSectors.join(', ')})`;
    }
    return 'Tutti i settori economici';
  }

  if (cleaned.length > 0) {
    return cleaned.slice(0, 4).join(' · ');
  }

  if (excludedSectors.length > 0) {
    return `Tutti i settori economici (esclusi ${excludedSectors.join(', ')})`;
  }

  return 'Settori da confermare';
};

const ensureSentenceStart = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
};

const humanizePositiveItem = (value: string): string => {
  const raw = value.replace(/^ok:\s*/i, '').replace(/^idoneo:\s*/i, '').trim();
  const normalized = normalizeText(raw);

  if (/territorio coerente|regione compatibile|territorio macro coerente/.test(normalized)) {
    return 'La tua area geografica è compatibile con il bando.';
  }
  if (/beneficiario coerente|forma giuridica coerente|beneficiari compatibili/.test(normalized)) {
    return 'Il profilo impresa rientra tra i beneficiari previsti.';
  }
  if (/tipo aiuto in linea|aiuto coerente/.test(normalized)) {
    return 'La forma di agevolazione è in linea con la tua richiesta.';
  }
  if (/adatto a nuova attivita|impresa da costituire coerente/.test(normalized)) {
    return 'Il bando è adatto a una nuova attività.';
  }
  if (/copertura economica alta/.test(normalized)) {
    return 'La copertura economica del bando è alta.';
  }

  const clean = ensureSentenceStart(raw.replace(/^requisiti hard compatibili$/i, 'Requisiti principali compatibili'));
  return clean.endsWith('.') ? clean : `${clean}.`;
};

const humanizeCriticalItem = (value: string): string => {
  const raw = value.replace(/^da verificare:\s*/i, '').trim();
  const normalized = normalizeText(raw);

  if (/settore da verificare|settore non compatibile/.test(normalized)) {
    return "Il settore dell'attività va confermato sui requisiti specifici.";
  }
  if (/ateco da verificare|ateco non compatibile/.test(normalized)) {
    return 'Serve confermare il codice ATECO richiesto dal bando.';
  }
  if (/forma giuridica da verificare|forma giuridica non compatibile/.test(normalized)) {
    return 'Va verificata la forma giuridica ammessa.';
  }
  if (/stato occupazionale da verificare|richiede stato disoccupato/.test(normalized)) {
    return 'Va verificato il requisito occupazionale richiesto.';
  }
  if (/territorio da verificare|regione non inclusa/.test(normalized)) {
    return 'Va verificata la copertura territoriale del bando.';
  }

  const clean = ensureSentenceStart(raw);
  return clean.endsWith('.') ? clean : `${clean}.`;
};

export function GrantDetailInlinePro({ grantId }: { grantId: string }) {
  const [detail, setDetail] = useState<GrantDetail | null>(null);
  const [explain, setExplain] = useState<Explainability | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = String(grantId || '').trim();
    if (!id) {
      setError('ID bando non valido.');
      setDetail(null);
      setExplain(null);
      return;
    }

    let cancelled = false;
    setError(null);
    setDetail(null);
    setExplain(null);

    const fetchWithTimeout = async (url: string, timeoutMs = 4_000) => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, { cache: 'no-store', signal: controller.signal });
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    const normalizeGrant = (rawGrant: GrantDetail): GrantDetail => ({
      ...rawGrant,
      beneficiaries: Array.isArray(rawGrant.beneficiaries) ? rawGrant.beneficiaries : [],
      sectors: Array.isArray(rawGrant.sectors) ? rawGrant.sectors : [],
      officialAttachments: Array.isArray(rawGrant.officialAttachments) ? rawGrant.officialAttachments : []
    });

    Promise.all([fetchWithTimeout(`/api/grants/${encodeURIComponent(id)}`), fetchWithTimeout(`/api/grants/${encodeURIComponent(id)}/explainability`)])
      .then(async ([grantRes, explainRes]) => {
        const grantJson = (await grantRes.json().catch(() => null)) as GrantDetail | { error?: string } | null;
        const explainJson = (await explainRes.json().catch(() => null)) as Explainability | { error?: string } | null;

        if (!grantRes.ok) {
          throw new Error((grantJson && 'error' in grantJson && grantJson.error) || 'Errore caricamento dettaglio bando');
        }
        if (!explainRes.ok) {
          throw new Error((explainJson && 'error' in explainJson && explainJson.error) || 'Errore explainability bando');
        }

        if (cancelled) return;
        setDetail(normalizeGrant(grantJson as GrantDetail));
        setExplain(explainJson as Explainability);
      })
      .catch((primaryError) => {
        if (cancelled) return;
        const message =
          primaryError instanceof Error
            ? primaryError.message
            : 'Errore caricamento dettaglio. Riprova tra qualche secondo.';
        setError(message);
      });

    return () => {
      cancelled = true;
    };
  }, [grantId]);

  if (error) {
    return (
      <div className="grant-detail-page grant-detail-layout">
        <section className="premium-card fade-up p-6 grant-detail-section grant-detail-hero">
          <p className="grant-detail-eyebrow">Scheda bando</p>
          <h1 className="grant-detail-title">Dettaglio incentivo non disponibile</h1>
          <p className="grant-section-subtitle">{error}</p>
          <div className="grant-cta-row">
            <a href="/" className="grant-cta-btn grant-cta-btn--solid">
              Torna allo scanner
            </a>
          </div>
        </section>
      </div>
    );
  }

  if (!detail || !explain) {
    return (
      <div className="grant-detail-page grant-detail-layout">
        <section className="premium-card fade-up p-6 grant-detail-section grant-detail-hero">
          <p className="grant-detail-eyebrow">Scheda bando</p>
          <h1 className="grant-detail-title">Caricamento dettaglio incentivo…</h1>
          <p className="grant-section-subtitle">Sto recuperando dati, compatibilità e documentazione ufficiale.</p>
        </section>
      </div>
    );
  }

  const probability = Math.max(0, Math.min(100, Math.round(explain.probabilityScore || 0)));
  const consultingLink = buildConsultingLink(detail.id, detail.title, detail.officialUrl);
  const grantStatus = detail.availabilityStatus === 'incoming' ? 'In arrivo' : 'Aperto';
  const beneficiariesLabel = oneLine(detail.beneficiaries, 'Imprese');
  const excludedSectors = toStringList(detail.requisitiHard?.['settori_esclusi']);
  const scopeRaw = String(detail.requisitiHard?.['settori_scope'] ?? '').trim();
  const hasAllSectorsScope =
    normalizeText(scopeRaw).includes('tutti_tranne_esclusi') ||
    detail.sectors.some((sector) => normalizeText(sector).includes('tutti i settori economici'));
  const sectorsLabel = formatSectorSummary(detail.sectors, excludedSectors, hasAllSectorsScope);
  const openingLabel = formatDate(detail.openingDate, 'Già aperto');
  const deadlineLabel = formatDate(detail.deadlineDate, 'A sportello');
  const economicSummary = economicSummaryFromDetail(detail);
  const whyFitItems = (explain.whyFit || []).filter(Boolean);
  const satisfiedItems = (explain.satisfiedRequirements || []).filter(Boolean);
  const missingItems = (explain.missingRequirements || []).filter(Boolean);
  const positiveItems = (satisfiedItems.length > 0 ? satisfiedItems : whyFitItems).map(humanizePositiveItem).slice(0, 4);
  const criticalItems = missingItems.map(humanizeCriticalItem).slice(0, 4);

  return (
    <div className="grant-detail-page grant-detail-layout">
      <section className="premium-card fade-up p-6 grant-detail-section grant-detail-hero">
        <div className="grant-hero-grid">
          <div>
            <p className="grant-detail-eyebrow">Scheda bando</p>
            <h1 className="grant-detail-title">{detail.title}</h1>
            <p className="grant-detail-authority">{detail.authority || 'Ente non specificato'}</p>
            <div className="grant-quick-pills">
              <span className="grant-pill-chip">Stato: {grantStatus}</span>
              <span className="grant-pill-chip">Apertura: {openingLabel}</span>
              <span className="grant-pill-chip">Scadenza: {deadlineLabel}</span>
              <span className="grant-pill-chip">Beneficiari: {beneficiariesLabel}</span>
              <span className="grant-pill-chip">Forma aiuto: {detail.aidForm || 'Agevolazione'}</span>
            </div>
          </div>

          {'message' in explain && explain.message ? (
            <div className="grant-probability-box">
              <div className="grant-probability-label">Probabilità stimata di ottenere il bando</div>
              <div className="grant-probability-value">N/D</div>
              <p className="grant-probability-hint">{explain.message}</p>
            </div>
          ) : (
            <div className="grant-probability-box">
              <div className="grant-probability-label">Probabilità stimata di ottenere il bando</div>
              <div className="grant-probability-value">{probability}%</div>
              <ProgressBar value={probability} />
              <p className="grant-probability-hint">Stima tecnica basata sui dati inseriti. Non è una garanzia.</p>
            </div>
          )}
        </div>
      </section>

      <section className="premium-card fade-up p-6 grant-detail-section">
        <h2 className="grant-section-title">Cosa offre in breve</h2>
        <div className="grant-summary-grid grant-summary-grid--compact">
          <div className="grant-summary-item grant-summary-item--key">
            <div className="grant-summary-k">% fondo perduto / copertura</div>
            <div className="grant-summary-v">{economicSummary.coverage}</div>
          </div>
          <div className="grant-summary-item">
            <div className="grant-summary-k">Spesa progetto ammissibile</div>
            <div className="grant-summary-v">{economicSummary.projectAmount}</div>
          </div>
          <div className="grant-summary-item">
            <div className="grant-summary-k">Beneficiari principali</div>
            <div className="grant-summary-v">{beneficiariesLabel}</div>
          </div>
          <div className="grant-summary-item">
            <div className="grant-summary-k">Settori ammessi</div>
            <div className="grant-summary-v">{sectorsLabel}</div>
          </div>
        </div>

        <div className="grant-cta-row grant-cta-row--double">
          <a href={detail.officialUrl} target="_blank" rel="noreferrer" className="grant-cta-btn grant-cta-btn--solid">
            Vai al bando ufficiale
          </a>
          <a href={consultingLink} target="_blank" rel="noreferrer" className="grant-cta-btn grant-cta-btn--consulting">
            Prenota consulenza gratuita
          </a>
        </div>

        {detail.officialAttachments.length > 0 ? (
          <div className="grant-attachments-row">
            {detail.officialAttachments.slice(0, 4).map((attachment, index) => (
              <a key={attachment} href={attachment} target="_blank" rel="noreferrer" className="grant-attachment-btn">
                Allegato {index + 1}
              </a>
            ))}
          </div>
        ) : null}
      </section>

      <section className="premium-card fade-up p-6 grant-detail-section">
        <h2 className="grant-section-title">Compatibilità con il tuo profilo</h2>
        {'message' in explain && explain.message ? <p className="grant-empty-note">{explain.message}</p> : null}
        <div className="grant-compat-summary">
          <div className="grant-compat-stat grant-compat-stat--ok">
            <span>Requisiti compatibili</span>
            <strong>{positiveItems.length}</strong>
          </div>
          <div className="grant-compat-stat grant-compat-stat--warn">
            <span>Requisiti da approfondire</span>
            <strong>{criticalItems.length}</strong>
          </div>
        </div>
        <div className="grant-compat-grid">
          <article className="grant-compat-card grant-compat-card--ok">
            <h3>Cosa è già compatibile</h3>
            <ul className="grant-compat-list">
              {positiveItems.length > 0 ? (
                positiveItems.map((item) => <li key={`ok-${item}`}>{item}</li>)
              ) : (
                <li>Profilo compatibile in modo generale con il bando.</li>
              )}
            </ul>
          </article>

          <article className="grant-compat-card grant-compat-card--warn">
            <h3>Cosa devi ancora verificare</h3>
            <ul className="grant-compat-list">
              {criticalItems.length > 0 ? (
                criticalItems.map((item) => <li key={`missing-${item}`}>{item}</li>)
              ) : (
                <li>Non risultano criticità principali con i dati disponibili.</li>
              )}
            </ul>
          </article>
        </div>
      </section>
    </div>
  );
}
