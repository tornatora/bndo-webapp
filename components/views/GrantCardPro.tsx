import Link from 'next/link';

export interface MatchCardItem {
  grantId: string;
  grantTitle: string;
  authority?: string | null;
  officialUrl?: string | null;
  beneficiaries?: string[];
  openingDate: string | null;
  deadlineDate: string | null;
  availabilityStatus: 'open' | 'incoming';
  aidForm?: string | null;
  aidIntensity?: string | null;
  budgetTotal: number | null;
  economicOffer?: Record<string, unknown> | null;
  probabilityScore: number;
  hardStatus: 'eligible' | 'not_eligible' | 'unknown';
  whyFit?: string[];
  satisfiedRequirements?: string[];
  missingRequirements?: string[];
  isClickDay?: boolean;
  isSpecialArea?: boolean;
  specialAreaType?: 'zes' | 'sisma' | 'montana' | null;
}

const statusText: Record<MatchCardItem['hardStatus'], string> = {
  eligible: 'Idoneo',
  unknown: 'Da verificare',
  not_eligible: 'Non idoneo',
};

const formatDate = (value: string | null, fallback: string) => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString('it-IT');
};

const formatCurrency = (value: number): string => `€ ${Math.round(value).toLocaleString('it-IT')}`;

const formatMoney = (value: number | null): string => {
  if (value === null || !Number.isFinite(value) || value <= 0) return 'Dati economici in aggiornamento';
  return formatCurrency(value);
};

const CONSULTING_EMAIL = process.env.NEXT_PUBLIC_CONSULTING_EMAIL || 'admin@grants.local';
const CONSULTING_URL = process.env.NEXT_PUBLIC_CONSULTING_URL || '';

const buildConsultingLink = (item: MatchCardItem): string => {
  if (CONSULTING_URL) {
    try {
      const url = new URL(CONSULTING_URL);
      url.searchParams.set('grantId', item.grantId);
      url.searchParams.set('bando', item.grantTitle);
      return url.toString();
    } catch {
      return CONSULTING_URL;
    }
  }

  const subject = encodeURIComponent(`Prenotazione consulenza bando: ${item.grantTitle}`);
  const body = encodeURIComponent(
    `Ciao, vorrei prenotare una consulenza per questo bando:\n${item.grantTitle}\nLink ufficiale: ${item.officialUrl || 'non disponibile'}`,
  );
  return `mailto:${CONSULTING_EMAIL}?subject=${subject}&body=${body}`;
};

const normalizeAid = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const classifyAid = (aidForm: string | null | undefined): { label: string; tone: 'green' | 'blue' | 'gray' } => {
  if (!aidForm) {
    return { label: 'Aiuto da verificare', tone: 'gray' };
  }
  const normalized = normalizeAid(aidForm);
  if (/(fondo perduto|contributo)/.test(normalized)) {
    return { label: 'Fondo perduto', tone: 'green' };
  }
  if (/(finanziamento|prestito|agevolato|garanzia)/.test(normalized)) {
    return { label: 'Finanziamento agevolato', tone: 'blue' };
  }
  if (/(credito d imposta|agevolazione fiscale)/.test(normalized)) {
    return { label: "Credito d'imposta", tone: 'blue' };
  }
  return { label: aidForm, tone: 'gray' };
};

const hasRequestedMismatch = (requestedAid: string | undefined, aidForm: string | null | undefined): boolean => {
  if (!requestedAid || !aidForm) return false;
  const requested = normalizeAid(requestedAid);
  const current = normalizeAid(aidForm);
  const requestedFondo = /(fondo perduto|contributo)/.test(requested);
  const currentFondo = /(fondo perduto|contributo)/.test(current);
  if (requestedFondo && !currentFondo) return true;
  return false;
};

const parseLocaleNumber = (raw: string): number | null => {
  const normalizedRaw = raw.toLowerCase().trim();
  if (!normalizedRaw) return null;

  let multiplier = 1;
  if (/(miliard|mld)/.test(normalizedRaw)) multiplier = 1_000_000_000;
  else if (/(milion|mln)/.test(normalizedRaw)) multiplier = 1_000_000;
  else if (/\bmila\b|\bk\b/.test(normalizedRaw)) multiplier = 1_000;

  const cleaned = normalizedRaw
    .replace(/€|eur|euro/g, '')
    .replace(/miliardi?|mld|milioni?|mln|mila|\bk\b/g, '')
    .replace(/\s+/g, '')
    .replace(/[^0-9,.\-]/g, '');

  if (!cleaned) return null;

  const match = cleaned.match(/-?[0-9][0-9,.\-]*/);
  if (!match) return null;

  let token = match[0].replace(/(?!^)-/g, '');

  if (token.includes(',') && token.includes('.')) {
    if (token.lastIndexOf(',') > token.lastIndexOf('.')) {
      token = token.replace(/\./g, '').replace(',', '.');
    } else {
      token = token.replace(/,/g, '');
    }
  } else if (token.includes(',')) {
    const parts = token.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      token = `${parts[0].replace(/\./g, '')}.${parts[1]}`;
    } else {
      token = parts.join('');
    }
  } else if (token.includes('.')) {
    const parts = token.split('.');
    if (parts.length === 2 && parts[1].length <= 2) {
      token = `${parts[0]}.${parts[1]}`;
    } else {
      token = parts.join('');
    }
  }

  const parsed = Number(token);
  if (!Number.isFinite(parsed)) return null;
  return parsed * multiplier;
};

const toNumeric = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return parseLocaleNumber(value);
  return null;
};

const formatRange = (min: number | null, max: number | null): string | null => {
  const safeMin = min !== null && Number.isFinite(min) && min > 0 ? min : null;
  const safeMax = max !== null && Number.isFinite(max) && max > 0 ? max : null;

  if (safeMin !== null && safeMax !== null) {
    const low = Math.min(safeMin, safeMax);
    const high = Math.max(safeMin, safeMax);
    return `Da ${formatCurrency(low)} a ${formatCurrency(high)}`;
  }
  if (safeMax !== null) return `Fino a ${formatCurrency(safeMax)}`;
  if (safeMin !== null) return `Da ${formatCurrency(safeMin)} a ${formatCurrency(safeMin)}`;
  return null;
};

const parseCoveragePercents = (
  coverageLabel: string | null | undefined,
  economic: Record<string, unknown> | null | undefined,
): { min: number; max: number } | null => {
  const fromMin = toNumeric(economic?.estimatedCoverageMinPercent);
  const fromMax = toNumeric(economic?.estimatedCoverageMaxPercent);

  if (fromMin !== null || fromMax !== null) {
    const min = fromMin ?? fromMax ?? 0;
    const max = fromMax ?? fromMin ?? 0;
    return {
      min: Math.max(0, Math.min(min, max)),
      max: Math.max(0, Math.max(min, max)),
    };
  }

  if (!coverageLabel) return null;
  const matches = Array.from(coverageLabel.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g))
    .map((m) => Number(m[1].replace(',', '.')))
    .filter((n) => Number.isFinite(n));

  if (matches.length === 0) return null;
  if (matches.length === 1) {
    return { min: matches[0], max: matches[0] };
  }
  return {
    min: Math.min(...matches),
    max: Math.max(...matches),
  };
};

const formatPercentValue = (value: number): string =>
  `${value.toLocaleString('it-IT', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 3,
  })}%`;

const formatPercentRange = (value: { min: number; max: number } | null): string => {
  if (!value) return '0%';
  const min = Math.max(0, value.min);
  const max = Math.max(0, value.max);
  if (min === 0 && max === 0) return '0%';
  if (Math.abs(min - max) < 0.001) return formatPercentValue(max);
  return `${formatPercentValue(min)} - ${formatPercentValue(max)}`;
};

const supportsFondoPerduto = (aidForm: string | null | undefined): boolean => {
  const normalized = normalizeAid(aidForm ?? '');
  return normalized.includes('fondo perduto');
};

const economicOffer = (
  aidForm: string | null | undefined,
  budgetTotal: number | null,
  aidIntensity: string | null | undefined,
  economic: Record<string, unknown> | null | undefined,
): { amount: string; coverage: string; projectAmount: string | null } => {
  const displayProjectAmountLabel =
    typeof economic?.displayProjectAmountLabel === 'string' && economic.displayProjectAmountLabel.trim()
      ? economic.displayProjectAmountLabel.trim()
      : null;
  const displayCoverageLabel =
    typeof economic?.displayCoverageLabel === 'string' && economic.displayCoverageLabel.trim()
      ? economic.displayCoverageLabel.trim()
      : null;

  const grantMin = toNumeric(economic?.grantMin);
  const grantMax = toNumeric(economic?.grantMax);
  const costMin = toNumeric(economic?.costMin);
  const costMax = toNumeric(economic?.costMax);
  const budgetAllocation = toNumeric(economic?.budgetAllocation);
  const economicValues = [grantMin, grantMax, costMin, costMax].filter(
    (value): value is number => value !== null && Number.isFinite(value) && value > 0,
  );
  const hasOnlyTinyEconomicValues = economicValues.length > 0 && Math.max(...economicValues) < 5000;
  let projectRange = formatRange(costMin, costMax);
  const rawCoverageLabel =
    displayCoverageLabel ||
    (typeof economic?.estimatedCoverageLabel === 'string' ? economic.estimatedCoverageLabel : aidIntensity || null);
  const coveragePercents = supportsFondoPerduto(aidForm) ? parseCoveragePercents(rawCoverageLabel, economic) : null;

  if (!projectRange && budgetTotal && Number.isFinite(budgetTotal) && budgetTotal > 0) {
    projectRange = formatRange(null, budgetTotal);
  }

  let investmentRange = displayProjectAmountLabel || projectRange;

  if (!investmentRange && budgetTotal !== null && budgetTotal > 0) {
    investmentRange = formatRange(null, budgetTotal);
  }

  if (!investmentRange && budgetAllocation !== null && budgetAllocation > 0) {
    investmentRange = formatRange(null, budgetAllocation);
  }

  if (hasOnlyTinyEconomicValues && (!budgetTotal || budgetTotal < 5000) && !displayProjectAmountLabel) {
    investmentRange = null;
  }

  if (investmentRange) {
    return {
      amount: investmentRange,
      coverage: formatPercentRange(coveragePercents),
      projectAmount: null,
    };
  }

  return {
    amount: budgetTotal && budgetTotal > 0 ? `Fino a ${formatCurrency(budgetTotal)}` : 'Dati economici in aggiornamento',
    coverage: formatPercentRange(coveragePercents),
    projectAmount: null,
  };
};

export function GrantCardPro({
  item,
  requestedAid,
  onOpenDetail,
  onVerifyRequirements
}: {
  item: MatchCardItem;
  requestedAid?: string;
  onOpenDetail?: (grantId: string) => void;
  onVerifyRequirements?: (grantId: string) => void;
}) {
  const availabilityLabel = item.availabilityStatus === 'incoming' ? 'In arrivo' : 'Aperto';
  const probability = Math.max(0, Math.min(100, Math.round(item.probabilityScore)));
  const aidInfo = classifyAid(item.aidForm);
  const mismatch = hasRequestedMismatch(requestedAid, item.aidForm);
  const offer = economicOffer(item.aidForm, item.budgetTotal, item.aidIntensity, item.economicOffer);
  const consultingLink = buildConsultingLink(item);
  const deadlineLabel = formatDate(item.deadlineDate, 'A sportello');
  const openingLabel = formatDate(item.openingDate, 'Già aperto');
  return (
    <article className="result-card result-card--minimal fade-up">
      <header className="result-card-head">
        <div className="result-card-titlewrap">
          <h3 className="result-card-title">{item.grantTitle}</h3>
          <p className="result-card-authority">{item.authority || 'Fonte ufficiale'}</p>
        </div>
        <div className="result-card-tags">
          <span className="result-tag result-tag--neutral result-tag--aid">{aidInfo.label}</span>
          <span
            className={
              item.availabilityStatus === 'incoming'
                ? 'result-tag result-tag--warn result-tag--availability'
                : 'result-tag result-tag--live result-tag--availability'
            }
          >
            {availabilityLabel}
          </span>
          {mismatch ? <span className="result-tag result-tag--warn">Alternativa al fondo perduto</span> : null}
          {item.isSpecialArea ? (
            <span className="result-tag result-tag--live" style={{ background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)', color: '#000' }}>
              Premium: {item.specialAreaType === 'zes' ? 'ZES' : item.specialAreaType === 'sisma' ? 'Sisma' : 'Area Speciale'}
            </span>
          ) : null}
        </div>
      </header>

      {item.isClickDay ? (
        <div className="result-alert-box" style={{ background: '#FFF3CD', border: '1px solid #FFEBAA', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.25rem' }}>⚠️</span>
            <div style={{ color: '#856404', fontSize: '0.9rem', fontWeight: 600 }}>
                URGENTE: Bando a sportello (Click Day). I fondi sono limitati, agisci subito!
            </div>
        </div>
      ) : null}

      <div className="result-info-line">
        <span>Apertura: {openingLabel}</span>
        <span>Scadenza: {deadlineLabel}</span>
        <span>{statusText[item.hardStatus]}</span>
      </div>

      <div className="result-kpis">
        <div className="result-kpi">
          <span className="result-kpi-k">Importo</span>
          <strong className="result-kpi-v">{offer.amount}</strong>
        </div>
        <div className="result-kpi">
          <span className="result-kpi-k">% fondo perduto</span>
          <strong className="result-kpi-v">{offer.coverage}</strong>
        </div>
        <div className="result-kpi result-kpi--prob">
          <span className="result-kpi-k">Probabilità stimata</span>
          <strong className="result-kpi-v result-kpi-v--prob">{probability}%</strong>
        </div>
      </div>

      <footer className="result-card-footer">
        <div className="result-actions">
          {onOpenDetail ? (
            <button type="button" className="result-btn result-btn--primary" onClick={() => onOpenDetail(item.grantId)}>
              Dettagli Bando
            </button>
          ) : (
            <Link href={`/grants/${item.grantId}`} className="result-btn result-btn--primary">
              Dettagli Bando
            </Link>
          )}
          {onVerifyRequirements ? (
            <button
              type="button"
              className="result-btn result-btn--primary result-btn--consult"
              onClick={() => onVerifyRequirements(item.grantId)}
            >
              Verifica requisiti
            </button>
          ) : (
            <a
              href={consultingLink}
              target="_blank"
              rel="noreferrer"
              className="result-btn result-btn--primary result-btn--consult"
            >
              Prenota una consulenza con un consulente BNDO
            </a>
          )}
        </div>
        <div className="result-links-inline">
          {item.officialUrl ? (
            <a className="result-source-link" href={item.officialUrl} target="_blank" rel="noreferrer">
              Fonte ufficiale
            </a>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
