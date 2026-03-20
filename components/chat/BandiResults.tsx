'use client';

import { memo } from 'react';

function formatDateIT(iso: string | null) {
  if (!iso) return 'N/D';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'N/D';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export type BandoResult = {
  id: string;
  title: string;
  authorityName: string;
  deadlineAt: string | null;
  sourceUrl: string;
  requirements: string[];
  matchScore?: number;
  matchReasons?: string[];
  mismatchFlags?: string[];
  aidForm?: string | null;
  aidIntensity?: string | null;
  budgetTotal?: number | null;
  economicOffer?: Record<string, unknown> | null;
  bookingUrl?: string | null;
  isClickDay?: boolean;
  isSpecialArea?: boolean;
  specialAreaType?: 'zes' | 'sisma' | 'montana' | null;
};

function normalizeAid(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseLocaleNumber(raw: string): number | null {
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
    token = token.lastIndexOf(',') > token.lastIndexOf('.') ? token.replace(/\./g, '').replace(',', '.') : token.replace(/,/g, '');
  } else if (token.includes(',')) {
    const parts = token.split(',');
    token = parts.length === 2 && parts[1].length <= 2 ? `${parts[0].replace(/\./g, '')}.${parts[1]}` : parts.join('');
  } else if (token.includes('.')) {
    const parts = token.split('.');
    token = parts.length === 2 && parts[1].length <= 2 ? `${parts[0]}.${parts[1]}` : parts.join('');
  }

  const parsed = Number(token);
  if (!Number.isFinite(parsed)) return null;
  return parsed * multiplier;
}

function toNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return parseLocaleNumber(value);
  return null;
}

function formatCurrency(value: number): string {
  return `€ ${Math.round(value).toLocaleString('it-IT')}`;
}

function formatRange(min: number | null, max: number | null): string | null {
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
}

function parseCoveragePercents(
  coverageLabel: string | null | undefined,
  economic: Record<string, unknown> | null | undefined,
): { min: number; max: number } | null {
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
  if (matches.length === 1) return { min: matches[0], max: matches[0] };
  return { min: Math.min(...matches), max: Math.max(...matches) };
}

function formatPercentValue(value: number): string {
  return `${value.toLocaleString('it-IT', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 3,
  })}%`;
}

function formatPercentRange(value: { min: number; max: number } | null): string {
  if (!value) return '0%';
  const min = Math.max(0, value.min);
  const max = Math.max(0, value.max);
  if (min === 0 && max === 0) return '0%';
  if (Math.abs(min - max) < 0.001) return formatPercentValue(max);
  return `${formatPercentValue(min)} - ${formatPercentValue(max)}`;
}

function supportsFondoPerduto(aidForm: string | null | undefined): boolean {
  return normalizeAid(aidForm ?? '').includes('fondo perduto');
}

function isVerifyLabel(value: string | null | undefined): boolean {
  if (!value) return false;
  return /da verificare/i.test(value);
}

function economicSummary(item: BandoResult): { amount: string; coverage: string } {
  const economic = item.economicOffer && typeof item.economicOffer === 'object' ? item.economicOffer : null;
  const displayAmountLabel =
    typeof economic?.displayAmountLabel === 'string' && economic.displayAmountLabel.trim() ? economic.displayAmountLabel.trim() : null;
  const displayProjectAmountLabel =
    typeof economic?.displayProjectAmountLabel === 'string' && economic.displayProjectAmountLabel.trim()
      ? economic.displayProjectAmountLabel.trim()
      : null;
  const displayCoverageLabel =
    typeof economic?.displayCoverageLabel === 'string' && economic.displayCoverageLabel.trim()
      ? economic.displayCoverageLabel.trim()
      : null;

  const costMin = toNumeric(economic?.costMin);
  const costMax = toNumeric(economic?.costMax);
  const budgetTotal =
    typeof item.budgetTotal === 'number' && Number.isFinite(item.budgetTotal) && item.budgetTotal > 0 ? item.budgetTotal : null;
  const amountFromRange = formatRange(costMin, costMax) || formatRange(null, budgetTotal);
  const amountCandidate = displayProjectAmountLabel || displayAmountLabel || amountFromRange;
  const amount = !amountCandidate || isVerifyLabel(amountCandidate) ? 'Importo da verificare' : amountCandidate;
  const rawCoverageLabel =
    displayCoverageLabel ||
    (typeof economic?.estimatedCoverageLabel === 'string' ? economic.estimatedCoverageLabel : item.aidIntensity || null);
  const coveragePercents = supportsFondoPerduto(item.aidForm) ? parseCoveragePercents(rawCoverageLabel, economic) : null;
  const coverageByLabel =
    typeof rawCoverageLabel === 'string' && rawCoverageLabel.trim() && !isVerifyLabel(rawCoverageLabel) ? rawCoverageLabel.trim() : null;
  const coverage = supportsFondoPerduto(item.aidForm)
    ? isVerifyLabel(rawCoverageLabel)
      ? 'Da verificare'
      : coveragePercents
        ? formatPercentRange(coveragePercents)
        : coverageByLabel && /%/.test(coverageByLabel)
          ? coverageByLabel
          : 'Da verificare'
    : '0%';

  return {
    amount,
    coverage,
  };
}

export const BandiResults = memo(function BandiResults({
  explanation,
  results,
  nearMisses = [],
  onOpenDetail,
  onVerifyRequirements,
  onSelectGrant,
}: {
  explanation: string;
  results: BandoResult[];
  nearMisses?: BandoResult[];
  onOpenDetail?: (grantId: string) => void;
  onVerifyRequirements?: (grantId: string) => void;
  onSelectGrant?: (grantId: string) => void;
}) {
  const followupDetailsHref = (item: BandoResult) => `/grants/${encodeURIComponent(item.id)}`;
  const followupBookingHref = (item: BandoResult) =>
    item.bookingUrl && item.bookingUrl.trim() ? item.bookingUrl : `/prenota?bandoId=${encodeURIComponent(item.id)}`;

  const compatibilitySummary = (item: BandoResult) => {
    const reasons = (item.matchReasons ?? []).filter((reason) => typeof reason === 'string' && reason.trim()).slice(0, 2);
    if (reasons.length) return reasons;
    return ['Compatibile con il profilo inserito'];
  };

  return (
    <div className="results-wrap">
      <div className="results-explanation">{explanation}</div>
      
      {results.length === 0 && (
        <div style={{ 
          background: '#FFF5F5', 
          border: '2px solid #FEB2B2', 
          padding: '1.5rem', 
          borderRadius: '16px', 
          marginBottom: '1.5rem', 
          textAlign: 'center' 
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
          <div style={{ color: '#C53030', fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.5rem' }}>
            Nessun bando trovato per i criteri inseriti
          </div>
          <div style={{ color: '#742A2A', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Non abbiamo trovato agevolazioni attive che corrispondano esattamente al tuo profilo. 
            Prova a descrivere meglio il tuo **settore** o l’**obiettivo** del finanziamento per aiutarci nella ricerca.
          </div>
        </div>
      )}

      <div className="results-list">
        {results.map((bando) => {
          const economic = economicSummary(bando);
          return (
            <div key={bando.id} className="result-card">
              <div className="result-head">
                <div className="result-title">{bando.title}</div>
                <div className="result-head-right">
                  {typeof bando.matchScore === 'number' ? (
                    <div className="result-score" aria-label="Punteggio compatibilita">
                      Match {Math.round(bando.matchScore * 100)}%
                    </div>
                  ) : null}
                  <div className="result-deadline">
                    <span className="result-deadline-label">Scadenza</span>
                    <span className="result-deadline-value">{formatDateIT(bando.deadlineAt)}</span>
                  </div>
                </div>
              </div>

              {bando.isClickDay ? (
                <div style={{ background: '#FFF3CD', border: '1px solid #FFEBAA', padding: '0.5rem 0.75rem', borderRadius: '6px', marginBottom: '0.75rem', fontSize: '0.85rem', color: '#856404', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>⚠️</span>
                    <span>URGENTE: Bando a sportello (Click Day). Agisci subito!</span>
                </div>
              ) : null}

              <div className="result-authority-row">
                <span className="result-authority-k">Ente</span>
                <span className="result-authority-v">{bando.authorityName}</span>
                {bando.isSpecialArea ? (
                  <span style={{ marginLeft: 'auto', background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)', color: '#000', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>
                    PREMIALITÀ {bando.specialAreaType?.toUpperCase()}
                  </span>
                ) : null}
              </div>

              <div className="result-econ-grid">
                <div className="result-econ-item">
                  <span className="result-econ-k">Importo</span>
                  <span className="result-econ-v">{economic.amount}</span>
                </div>
                <div className="result-econ-item">
                  <span className="result-econ-k">% fondo perduto</span>
                  <span className="result-econ-v">{economic.coverage}</span>
                </div>
              </div>

              <div className="result-why">
                {compatibilitySummary(bando).map((reason, idx) => (
                  <div key={idx} className="result-why-pill">
                    {reason}
                  </div>
                ))}
              </div>

              <div className="chat-result-actions">
                {onOpenDetail || onSelectGrant ? (
                  <button
                    type="button"
                    className="chat-result-btn chat-result-btn--details"
                    onClick={() => (onOpenDetail ?? onSelectGrant)?.(bando.id)}
                  >
                    Dettagli Bando
                  </button>
                ) : (
                  <a className="chat-result-btn chat-result-btn--details" href={followupDetailsHref(bando)}>
                    Dettagli Bando
                  </a>
                )}
                {onVerifyRequirements ? (
                  <button
                    type="button"
                    className="chat-result-btn chat-result-btn--consult"
                    onClick={() => onVerifyRequirements(bando.id)}
                  >
                    Verifica requisiti
                  </button>
                ) : (
                  <a
                    className="chat-result-btn chat-result-btn--consult"
                    href={followupBookingHref(bando)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Prenota una consulenza per questo bando con BNDO
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {nearMisses.length ? (
        <div className="near-miss-wrap">
          <div className="near-miss-title">Potresti accedere se</div>
          <div className="near-miss-list">
            {nearMisses.map((bando) => (
              <div key={bando.id} className="near-miss-card">
                <div className="near-miss-head">
                  <div className="near-miss-name">{bando.title}</div>
                  {typeof bando.matchScore === 'number' ? <div className="near-miss-score">{Math.round(bando.matchScore * 100)}%</div> : null}
                </div>
                {bando.mismatchFlags?.length ? <div className="near-miss-hint">{bando.mismatchFlags[0]}</div> : null}
                {onOpenDetail || onSelectGrant ? (
                  <button
                    type="button"
                    className="near-miss-link"
                    style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer' }}
                    onClick={() => (onOpenDetail ?? onSelectGrant)?.(bando.id)}
                  >
                    Dettagli Bando
                  </button>
                ) : (
                  <a className="near-miss-link" href={followupDetailsHref(bando)}>
                    Dettagli Bando
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
});
