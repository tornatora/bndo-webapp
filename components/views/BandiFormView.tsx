'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FullScreenScannerOverlayPro as FullScreenScannerOverlay, SCAN_OVERLAY_STEPS } from '@/components/views/FullScreenScannerOverlayPro';
import { GrantCardPro as GrantCard, type MatchCardItem } from '@/components/views/GrantCardPro';
import { apiRequest } from '@/lib/scannerPublicApi';

interface MatchLatestResponse {
  run: { id: string } | null;
  items: MatchCardItem[];
  nearMisses?: MatchCardItem[];
}

interface CoverageResponse {
  inProgressSources: number;
  missingItemsOpen: number;
}

interface ProfileFormState {
  businessExists: boolean;
  activityType: string;
  legalForm: string;
  employmentStatus: string;
  companySize: string;
  employees: string;
  founderAge: string;
  timelineMonths: string;
  cofundingAvailable: boolean;
  region: string;
  sector: string;
  atecoCodes: string;
  fundingGoal: string;
  plannedInvestment: string;
  targetAmount: string;
  aidPreference: string;
}

type AvailabilityFilter = 'all' | 'open' | 'incoming';
type SortMode = 'coverage' | 'fit' | 'deadline' | 'budget';
type JourneyStep = 1 | 2;

const IT_REGIONS = [
  '',
  'Abruzzo',
  'Basilicata',
  'Calabria',
  'Campania',
  'Emilia-Romagna',
  'Friuli-Venezia Giulia',
  'Lazio',
  'Liguria',
  'Lombardia',
  'Marche',
  'Molise',
  'Piemonte',
  'Puglia',
  'Sardegna',
  'Sicilia',
  'Toscana',
  'Trentino-Alto Adige',
  'Umbria',
  "Valle d'Aosta",
  'Veneto',
];

const defaultProfile: ProfileFormState = {
  businessExists: true,
  activityType: '',
  legalForm: '',
  employmentStatus: '',
  companySize: '',
  employees: '',
  founderAge: '',
  timelineMonths: '6',
  cofundingAvailable: true,
  region: '',
  sector: '',
  atecoCodes: '',
  fundingGoal: '',
  plannedInvestment: '',
  targetAmount: '',
  aidPreference: 'fondo perduto',
};

const toNumberOrNull = (value: string): number | null => {
  if (!value.trim()) return null;
  const normalized = value.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const toIntOrNull = (value: string): number | null => {
  const parsed = toNumberOrNull(value);
  return parsed === null ? null : Math.round(parsed);
};

const toTimestampOrMax = (value: string | null): number => {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
};

const normalizeFilterText = (value: string | null | undefined): string =>
  (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const isGenericListingItem = (item: MatchCardItem): boolean => {
  const title = normalizeFilterText(item.grantTitle);
  const authority = normalizeFilterText(item.authority);
  const source = normalizeFilterText(item.officialUrl);

  if (!title) return true;
  if (/^(bandi|catalogo|elenco)\b/.test(title)) return true;
  if (/^avvisi\b/.test(title)) return true;
  if (/^bandi\s+(regione|camera|cciaa|comune|provincia|citta metropolitana)\b/.test(title)) return true;
  if (/(magazine opportunita regionali|portale bandi)/.test(title)) return true;
  if (/(magazine opportunita regionali|portale bandi)/.test(source)) return true;
  if (/^regione [a-z' -]+$/.test(authority) && /^bandi\b/.test(title)) return true;

  return false;
};

const readNumeric = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value
      .replace(/\s+/g, '')
      .replace(/€/g, '')
      .replace(/[^0-9,.-]/g, '');
    if (!cleaned) return null;
    const normalized =
      cleaned.includes(',') && cleaned.includes('.')
        ? cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
          ? cleaned.replace(/\./g, '').replace(',', '.')
          : cleaned.replace(/,/g, '')
        : cleaned.includes(',')
          ? cleaned.replace(/\./g, '').replace(',', '.')
          : cleaned.replace(/\./g, '');
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const hasEconomicCompleteness = (item: MatchCardItem): boolean => {
  if (item.budgetTotal && item.budgetTotal > 0) return true;
  const economic = item.economicOffer ?? null;
  if (!economic || typeof economic !== 'object') return false;

  const displayAmountLabel =
    typeof (economic as Record<string, unknown>).displayAmountLabel === 'string'
      ? String((economic as Record<string, unknown>).displayAmountLabel).trim()
      : '';
  const grantMin = readNumeric((economic as Record<string, unknown>).grantMin);
  const grantMax = readNumeric((economic as Record<string, unknown>).grantMax);
  const costMin = readNumeric((economic as Record<string, unknown>).costMin);
  const costMax = readNumeric((economic as Record<string, unknown>).costMax);
  const budgetAllocation = readNumeric((economic as Record<string, unknown>).budgetAllocation);
  const coverageMin = readNumeric((economic as Record<string, unknown>).estimatedCoverageMinPercent);
  const coverageMax = readNumeric((economic as Record<string, unknown>).estimatedCoverageMaxPercent);

  if (displayAmountLabel) return true;
  if ((grantMin ?? 0) > 0 || (grantMax ?? 0) > 0) return true;
  if (((coverageMin ?? 0) > 0 || (coverageMax ?? 0) > 0) && ((costMin ?? 0) > 0 || (costMax ?? 0) > 0)) return true;
  if ((budgetAllocation ?? 0) > 0) return true;

  return false;
};

const parsePercentValues = (value: string | null | undefined): number[] => {
  if (!value) return [];
  return Array.from(value.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g))
    .map((match) => Number(match[1].replace(',', '.')))
    .filter((num) => Number.isFinite(num))
    .map((num) => Math.max(0, Math.min(100, num)));
};

const coverageScore = (item: MatchCardItem): number => {
  const economic = item.economicOffer ?? null;
  if (!economic || typeof economic !== 'object') return 0;

  const fromMin = readNumeric((economic as Record<string, unknown>).estimatedCoverageMinPercent);
  const fromMax = readNumeric((economic as Record<string, unknown>).estimatedCoverageMaxPercent);
  if ((fromMin ?? 0) > 0 || (fromMax ?? 0) > 0) {
    return Math.max(fromMin ?? 0, fromMax ?? 0);
  }

  const labels = [
    typeof (economic as Record<string, unknown>).displayCoverageLabel === 'string'
      ? String((economic as Record<string, unknown>).displayCoverageLabel)
      : null,
    typeof (economic as Record<string, unknown>).estimatedCoverageLabel === 'string'
      ? String((economic as Record<string, unknown>).estimatedCoverageLabel)
      : null,
    item.aidIntensity ?? null,
  ];

  const values = labels.flatMap((entry) => parsePercentValues(entry));
  if (values.length === 0) return 0;
  return Math.max(...values);
};

const prefersFondoPerduto = (aidPreference: string): boolean => {
  const normalized = normalizeFilterText(aidPreference);
  return normalized.includes('fondo') || normalized.includes('contributo');
};

const simplifyNearMissCondition = (value: string): string => {
  const base = value
    .replace(/^potresti accedere se:\s*/i, '')
    .replace(/,\s*se previsto dal bando\.?/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!base) {
    return 'verifichi i requisiti mancanti indicati nel bando.';
  }

  if (/presenti domanda come impresa gia costituita e attiva/i.test(normalizeFilterText(base))) {
    return 'hai gia un\'impresa costituita e attiva.';
  }

  if (/impresa da costituire|impresa costituenda/i.test(base)) {
    return 'presenti domanda come impresa da costituire.';
  }

  return base.endsWith('.') ? base : `${base}.`;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function BandiFormView(_props: { initialGrantId?: string | null } = {}) {
  const [profile, setProfile] = useState<ProfileFormState>(defaultProfile);

  const [matching, setMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [matchItems, setMatchItems] = useState<MatchCardItem[]>([]);
  const [nearMissItems, setNearMissItems] = useState<MatchCardItem[]>([]);
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('coverage');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [journeyStep, setJourneyStep] = useState<JourneyStep>(1);
  const [stepOneAttempted, setStepOneAttempted] = useState(false);
  const [stepTwoAttempted, setStepTwoAttempted] = useState(false);
  const [overlayProgress, setOverlayProgress] = useState(0);
  const [overlayStepIndex, setOverlayStepIndex] = useState(0);
  const formRef = useRef<HTMLElement | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const pendingStepScrollRef = useRef(false);
  const overlayProgressTimerRef = useRef<number | null>(null);
  const runIdRef = useRef(0);

  const scrollScannerViewportToTop = (behavior: ScrollBehavior = 'smooth') => {
    const pane = formRef.current?.closest('.mainpane');
    if (pane instanceof HTMLElement) {
      pane.scrollTo({ top: 0, behavior });
      if (behavior === 'auto') {
        pane.scrollTop = 0;
      } else {
        window.setTimeout(() => {
          pane.scrollTop = 0;
        }, 180);
      }
      return;
    }

    formRef.current?.scrollIntoView({ behavior, block: 'start' });
  };

  const forceScannerViewportTop = (persistMs = 0) => {
    const pane = formRef.current?.closest('.mainpane');
    if (pane instanceof HTMLElement) {
      pane.scrollTop = 0;
      pane.scrollTo({ top: 0, behavior: 'auto' });
      if (persistMs > 0) {
        const started = window.performance.now();
        const settle = () => {
          pane.scrollTop = 0;
          pane.scrollTo({ top: 0, behavior: 'auto' });
          if (window.performance.now() - started < persistMs) {
            window.requestAnimationFrame(settle);
          }
        };
        window.requestAnimationFrame(settle);
      }
      return;
    }
    scrollScannerViewportToTop('auto');
  };

  const scheduleFormScroll = () => {
    window.requestAnimationFrame(() => {
      forceScannerViewportTop(420);
      window.setTimeout(() => {
        forceScannerViewportTop(420);
      }, 80);
    });
  };

  const stopOverlayProgressLoop = () => {
    if (overlayProgressTimerRef.current !== null) {
      window.clearInterval(overlayProgressTimerRef.current);
      overlayProgressTimerRef.current = null;
    }
  };

  const startOverlayProgressLoop = () => {
    stopOverlayProgressLoop();
    overlayProgressTimerRef.current = window.setInterval(() => {
      setOverlayProgress((prev) => {
        if (prev >= 92) return prev;
        const baseStep = prev < 24 ? 6.8 : prev < 56 ? 3.6 : prev < 78 ? 1.8 : 0.9;
        const jitter = prev < 78 ? Math.random() : Math.random() * 0.35;
        return Math.min(92, prev + baseStep + jitter);
      });
    }, 110);
  };

  useEffect(() => {
    if (!pendingStepScrollRef.current) return;
    pendingStepScrollRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      forceScannerViewportTop(420);
    });
    const timeoutId = window.setTimeout(() => {
      forceScannerViewportTop(420);
    }, 180);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeoutId);
    };
  }, [journeyStep]);

  useEffect(() => {
    if (!matching) return;
    const frame = window.requestAnimationFrame(() => {
      scrollScannerViewportToTop('auto');
    });
    const timeoutId = window.setTimeout(() => {
      scrollScannerViewportToTop('auto');
    }, 140);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeoutId);
    };
  }, [matching]);

  useEffect(() => {
    const clamped = Math.max(0, Math.min(100, overlayProgress));
    const idx = Math.min(SCAN_OVERLAY_STEPS.length - 1, Math.floor((clamped / 100) * SCAN_OVERLAY_STEPS.length));
    setOverlayStepIndex((prev) => (prev === idx ? prev : idx));
  }, [overlayProgress]);

  useEffect(() => {
    return () => {
      if (overlayProgressTimerRef.current !== null) {
        window.clearInterval(overlayProgressTimerRef.current);
        overlayProgressTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('scanner-overlay-open', matching);
    document.documentElement.classList.toggle('scanner-overlay-open', matching);
    return () => {
      document.body.classList.remove('scanner-overlay-open');
      document.documentElement.classList.remove('scanner-overlay-open');
    };
  }, [matching]);

  useEffect(() => {
    apiRequest<CoverageResponse>('/api/v1/public/coverage')
      .then(setCoverage)
      .catch(() => setCoverage(null));
  }, []);

  const stepOneReady = useMemo(() => {
    const hasRegion = Boolean(profile.region.trim());
    if (!profile.businessExists) {
      return hasRegion;
    }

    const hasSectorSignal = Boolean(profile.sector.trim()) || Boolean(profile.atecoCodes.trim());
    const hasActivityType = Boolean(profile.activityType.trim());
    const hasEntityDetail = Boolean(profile.legalForm.trim());

    return hasRegion && hasActivityType && hasSectorSignal && hasEntityDetail;
  }, [profile.region, profile.activityType, profile.sector, profile.atecoCodes, profile.businessExists, profile.legalForm]);

  const stepTwoReady = useMemo(() => {
    if (profile.businessExists) {
      return Boolean(profile.fundingGoal.trim()) && Boolean(profile.targetAmount.trim());
    }
    return true;
  }, [profile.businessExists, profile.fundingGoal, profile.targetAmount]);

  const canRun = useMemo(() => stepOneReady && stepTwoReady, [stepOneReady, stepTwoReady]);

  const missingBaseFields = useMemo(() => {
    const missing: string[] = [];
    if (!profile.region.trim()) missing.push('Regione');
    if (profile.businessExists) {
      if (!profile.activityType.trim()) missing.push('Tipo impresa');
      if (!profile.sector.trim() && !profile.atecoCodes.trim()) missing.push('Settore o ATECO');
      if (!profile.legalForm.trim()) missing.push('Forma giuridica');
    }
    return missing;
  }, [profile.region, profile.activityType, profile.sector, profile.atecoCodes, profile.businessExists, profile.legalForm]);

  const journeyProgress = journeyStep === 1 ? 50 : 100;

  const availableItems = useMemo(() => {
    return [...matchItems].filter(
      (item) =>
        (item.availabilityStatus === 'open' || item.availabilityStatus === 'incoming') &&
        !isGenericListingItem(item) &&
        hasEconomicCompleteness(item),
    );
  }, [matchItems]);

  const openCount = useMemo(
    () => availableItems.filter((item) => item.availabilityStatus === 'open').length,
    [availableItems],
  );

  const incomingCount = useMemo(
    () => availableItems.filter((item) => item.availabilityStatus === 'incoming').length,
    [availableItems],
  );

  const visibleItems = useMemo(() => {
    const filtered = availableItems.filter((item) => {
      if (availabilityFilter === 'all') return true;
      return item.availabilityStatus === availabilityFilter;
    });

    return filtered.sort((a, b) => {
      if (sortMode === 'coverage') {
        const coverageDelta = coverageScore(b) - coverageScore(a);
        if (coverageDelta !== 0) return coverageDelta;
      }

      if (sortMode === 'deadline') {
        return toTimestampOrMax(a.deadlineDate) - toTimestampOrMax(b.deadlineDate);
      }

      if (sortMode === 'budget') {
        const budgetA = a.budgetTotal ?? -1;
        const budgetB = b.budgetTotal ?? -1;
        if (budgetA !== budgetB) return budgetB - budgetA;
      }

      if (a.availabilityStatus !== b.availabilityStatus) {
        return a.availabilityStatus === 'open' ? -1 : 1;
      }
      if (a.hardStatus !== b.hardStatus) {
        if (a.hardStatus === 'eligible') return -1;
        if (b.hardStatus === 'eligible') return 1;
        if (a.hardStatus === 'unknown') return -1;
        if (b.hardStatus === 'unknown') return 1;
      }
      if (sortMode === 'fit' && prefersFondoPerduto(profile.aidPreference)) {
        const coverageDelta = coverageScore(b) - coverageScore(a);
        if (coverageDelta !== 0) {
          return coverageDelta;
        }
      }
      return b.probabilityScore - a.probabilityScore;
    });
  }, [availableItems, availabilityFilter, sortMode, profile.aidPreference]);

  const selectedCount = useMemo(
    () =>
      availabilityFilter === 'all'
        ? availableItems.length
        : availableItems.filter((item) => item.availabilityStatus === availabilityFilter).length,
    [availableItems, availabilityFilter],
  );

  const saveProfile = async () => {
    await apiRequest('/api/v1/profile/me', 'PUT', null, {
      region: profile.region || null,
      businessExists: profile.businessExists,
      legalForm: profile.businessExists ? profile.legalForm || profile.activityType || null : profile.activityType || null,
      employmentStatus: !profile.businessExists ? profile.employmentStatus || null : null,
      companySize: profile.businessExists ? profile.companySize || null : null,
      employees: profile.businessExists ? toIntOrNull(profile.employees) : null,
      age: !profile.businessExists ? toIntOrNull(profile.founderAge) : null,
      timelineMonths: !profile.businessExists ? toIntOrNull(profile.timelineMonths) : null,
      cofundingAvailable: profile.cofundingAvailable,
      sector: profile.sector || null,
      atecoCodes: profile.atecoCodes
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      aidPreference: profile.aidPreference || null,
      plannedInvestment: toNumberOrNull(profile.plannedInvestment),
      targetAmount: toNumberOrNull(profile.targetAmount),
      constraints: {
        flow: profile.businessExists ? 'azienda_attiva' : 'azienda_da_aprire',
        activityType: profile.activityType,
        fundingGoal: profile.fundingGoal || null,
      },
    });
  };

  const runMatching = async () => {
    if (!stepOneReady) {
      setStepOneAttempted(true);
      if (journeyStep === 1) {
        scheduleFormScroll();
      } else {
        pendingStepScrollRef.current = true;
        setJourneyStep(1);
      }
      setError(
        profile.businessExists
          ? 'Compila i campi obbligatori evidenziati in Info base.'
          : 'Per azienda da aprire è obbligatoria solo la Regione.',
      );
      return;
    }

    if (!stepTwoReady) {
      setStepTwoAttempted(true);
      if (journeyStep === 2) {
        scheduleFormScroll();
      } else {
        pendingStepScrollRef.current = true;
        setJourneyStep(2);
      }
      setError(
        profile.businessExists
          ? 'Indica obiettivo e importo richiesto per la tua impresa.'
          : 'Per azienda da aprire inserisci almeno obiettivo o importo richiesto.',
      );
      return;
    }

    if (!canRun) {
      setError('Compila i dati obbligatori per avviare la ricerca.');
      return;
    }

    const currentRunId = runIdRef.current + 1;
    runIdRef.current = currentRunId;
    const isStaleRun = () => runIdRef.current !== currentRunId;

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    scrollScannerViewportToTop('auto');
    await wait(40);
    setMatching(true);
    setOverlayProgress(8);
    setOverlayStepIndex(0);
    startOverlayProgressLoop();
    setError(null);
    setNearMissItems([]);
    let shouldScrollResults = false;

    try {
      await saveProfile();
      if (isStaleRun()) return;
      setOverlayProgress((prev) => Math.max(prev, 30));
      await apiRequest('/api/v1/matching/run', 'POST', null, {});
      if (isStaleRun()) return;
      setOverlayProgress((prev) => Math.max(prev, 64));
      const latest = await apiRequest<MatchLatestResponse>('/api/v1/matching/latest', 'GET');
      if (isStaleRun()) return;

      stopOverlayProgressLoop();
      setMatchItems(latest.items);
      setNearMissItems(latest.nearMisses ?? []);
      setOverlayProgress(100);
      setOverlayStepIndex(SCAN_OVERLAY_STEPS.length - 1);
      await wait(90);
      shouldScrollResults = true;
    } catch (err) {
      if (isStaleRun()) return;
      stopOverlayProgressLoop();
      setOverlayProgress(100);
      setOverlayStepIndex(SCAN_OVERLAY_STEPS.length - 1);
      await wait(90);
      setError((err as Error).message || 'Errore durante la ricerca');
    } finally {
      if (isStaleRun()) return;
      stopOverlayProgressLoop();
      setMatching(false);
      if (shouldScrollResults) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        });
      }
    }
  };

  const goToStep = (step: JourneyStep, options?: { scroll?: boolean }) => {
    if (step === 2 && !stepOneReady) return;
    const shouldScroll = options?.scroll ?? true;
    if (shouldScroll) {
      forceScannerViewportTop(420);
    }
    if (step === journeyStep) {
      if (shouldScroll) scheduleFormScroll();
      return;
    }
    pendingStepScrollRef.current = shouldScroll;
    setJourneyStep(step);
    if (shouldScroll) {
      window.requestAnimationFrame(() => {
        forceScannerViewportTop(420);
      });
      window.setTimeout(() => {
        forceScannerViewportTop(420);
      }, 120);
      window.setTimeout(() => {
        forceScannerViewportTop(420);
      }, 260);
    }
  };

  const setBusinessMode = (businessExists: boolean) => {
    setProfile((prev) => ({
      ...prev,
      businessExists,
      employmentStatus: businessExists ? '' : prev.employmentStatus,
      founderAge: businessExists ? '' : prev.founderAge,
    }));
  };

  const handleBusinessSegmentPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const pickExisting = localX <= rect.width / 2;
    setBusinessMode(pickExisting);
    event.preventDefault();
  };

  return (
    <div className="scanner-v2 space-y-8">
      <section ref={formRef} className="panel-card full-search-bar fade-up">
        <div className="full-search-head">
          <h1 className="full-search-title">Scanner bandi</h1>
          <p className="full-search-sub">Percorso rapido in 2 step.</p>
        </div>

        <div className="journey-head">
          <div className="journey-track" aria-hidden="true">
            <span style={{ width: `${journeyProgress}%` }} />
          </div>
          <div className="journey-steps" role="tablist" aria-label="Percorso compilazione">
            <button
              type="button"
              className={journeyStep === 1 ? 'journey-step is-active' : stepOneReady ? 'journey-step is-done' : 'journey-step'}
              onClick={() => goToStep(1)}
            >
              <span>1</span> Base
            </button>
            <button
              type="button"
              className={journeyStep === 2 ? 'journey-step is-active' : canRun ? 'journey-step is-done' : 'journey-step'}
              onClick={() => goToStep(2)}
              disabled={!stepOneReady}
            >
              <span>2</span> Progetto
            </button>
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            setStepTwoAttempted(true);
            void runMatching();
          }}
          className="full-search-form"
        >
          {journeyStep === 1 ? (
            <div className="journey-panel">
              <div className="base-info-head">
                <div className="full-search-section-title">Info base</div>
                <span className="required-pill">Obbligatorie</span>
              </div>
              <p className="base-info-sub">Compila questi dati minimi per trovare i bandi giusti.</p>

              <div
                className="segmented segmented-wide segmented-business"
                role="group"
                aria-label="Stato impresa"
                onPointerDown={handleBusinessSegmentPointerDown}
              >
                <button
                  type="button"
                  className={profile.businessExists ? 'seg-item is-active' : 'seg-item'}
                  onClick={() => setBusinessMode(true)}
                >
                  Azienda già attiva
                </button>
                <button
                  type="button"
                  className={!profile.businessExists ? 'seg-item is-active' : 'seg-item'}
                  onClick={() => setBusinessMode(false)}
                >
                  Azienda da aprire
                </button>
              </div>

              <div className="full-search-grid full-search-grid-step">
                <label className="form-field">
                  <div className="form-label">Regione *</div>
                  <select
                    className={`form-control${stepOneAttempted && !profile.region.trim() ? ' is-invalid' : ''}`}
                    value={profile.region}
                    onChange={(event) => setProfile((prev) => ({ ...prev, region: event.target.value }))}
                  >
                    {IT_REGIONS.map((region) => (
                      <option key={region} value={region}>
                        {region || 'Seleziona regione...'}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-field">
                  <div className="form-label">Tipo impresa{profile.businessExists ? ' *' : ''}</div>
                  <select
                    className={`form-control${
                      stepOneAttempted && profile.businessExists && !profile.activityType.trim() ? ' is-invalid' : ''
                    }`}
                    value={profile.activityType}
                    onChange={(event) => setProfile((prev) => ({ ...prev, activityType: event.target.value }))}
                  >
                    <option value="">Seleziona tipo impresa...</option>
                    <option value="PMI">PMI</option>
                    <option value="Startup">Startup</option>
                    <option value="Microimpresa">Microimpresa</option>
                    <option value="Professionista">Professionista</option>
                    <option value="Cooperativa">Cooperativa</option>
                    <option value="Grande impresa">Grande impresa</option>
                  </select>
                </label>

                <label className="form-field">
                  <div className="form-label">Settore{profile.businessExists ? ' *' : ''}</div>
                  <input
                    className={`form-control${
                      stepOneAttempted &&
                      profile.businessExists &&
                      !profile.sector.trim() &&
                      !profile.atecoCodes.trim()
                        ? ' is-invalid'
                        : ''
                    }`}
                    value={profile.sector}
                    onChange={(event) => setProfile((prev) => ({ ...prev, sector: event.target.value }))}
                    placeholder="Es. turismo, commercio, digitale"
                  />
                </label>

                <label className="form-field">
                  <div className="form-label">Codice ATECO{profile.businessExists ? ' *' : ''}</div>
                  <input
                    className={`form-control${
                      stepOneAttempted &&
                      profile.businessExists &&
                      !profile.sector.trim() &&
                      !profile.atecoCodes.trim()
                        ? ' is-invalid'
                        : ''
                    }`}
                    value={profile.atecoCodes}
                    onChange={(event) => setProfile((prev) => ({ ...prev, atecoCodes: event.target.value }))}
                    placeholder="Es. 62.01"
                  />
                  <div className="form-help">
                    {profile.businessExists
                      ? 'Compila Settore o ATECO (anche entrambi).'
                      : 'Facoltativo: aiutano a rendere i risultati più precisi.'}
                  </div>
                </label>

                {profile.businessExists ? (
                  <label className="form-field">
                    <div className="form-label">Forma giuridica *</div>
                    <select
                      className={`form-control${stepOneAttempted && !profile.legalForm.trim() ? ' is-invalid' : ''}`}
                      value={profile.legalForm}
                      onChange={(event) => setProfile((prev) => ({ ...prev, legalForm: event.target.value }))}
                    >
                      <option value="">Seleziona forma giuridica...</option>
                      <option value="SRL">SRL</option>
                      <option value="SRLS">SRLS</option>
                      <option value="SPA">SPA</option>
                      <option value="SNC">SNC</option>
                      <option value="SAS">SAS</option>
                      <option value="Ditta individuale">Ditta individuale</option>
                      <option value="Cooperativa">Cooperativa</option>
                      <option value="Altro">Altro</option>
                    </select>
                  </label>
                ) : (
                  <>
                    <label className="form-field">
                      <div className="form-label">Età proponente</div>
                      <input
                        className="form-control"
                        inputMode="numeric"
                        value={profile.founderAge}
                        onChange={(event) => setProfile((prev) => ({ ...prev, founderAge: event.target.value }))}
                        placeholder="Es. 29"
                      />
                    </label>
                    <label className="form-field">
                      <div className="form-label">Stato occupazionale</div>
                      <select
                        className="form-control"
                        value={profile.employmentStatus}
                        onChange={(event) => setProfile((prev) => ({ ...prev, employmentStatus: event.target.value }))}
                      >
                        <option value="">Seleziona stato...</option>
                        <option value="disoccupato">Disoccupato</option>
                        <option value="inoccupato">Inoccupato</option>
                        <option value="studente">Studente</option>
                        <option value="occupato">Occupato</option>
                        <option value="neet">NEET</option>
                        <option value="altro">Altro</option>
                      </select>
                      <div className="form-help">
                        Opzionale ma utile: molti bandi per nuove imprese danno priorità a disoccupati/inoccupati.
                      </div>
                    </label>
                  </>
                )}
              </div>

              {stepOneAttempted && missingBaseFields.length > 0 ? (
                <div className="journey-missing">
                  {profile.businessExists
                    ? 'Compila i campi obbligatori evidenziati in rosso.'
                    : 'Per azienda da aprire devi solo selezionare la Regione.'}
                </div>
              ) : null}

              <div className="journey-actions">
                <button
                  type="button"
                  className="journey-next"
                  onClick={() => {
                    setStepOneAttempted(true);
                    if (stepOneReady) {
                      setError(null);
                      goToStep(2);
                    }
                  }}
                >
                  Continua
                </button>
              </div>
            </div>
          ) : null}

          {journeyStep === 2 ? (
            <div className="journey-panel">
              <div className="full-search-section-title">Dati progetto</div>
              <div className="full-search-grid full-search-grid-step">
                <label className="form-field full-search-goal">
                  <div className="form-label">Obiettivo{profile.businessExists ? ' *' : ''}</div>
                  <input
                    className={`form-control${
                      stepTwoAttempted && profile.businessExists && !profile.fundingGoal.trim() ? ' is-invalid' : ''
                    }`}
                    value={profile.fundingGoal}
                    onChange={(event) => setProfile((prev) => ({ ...prev, fundingGoal: event.target.value }))}
                    placeholder="Es. aprire laboratorio, comprare macchinari, e-commerce"
                  />
                </label>

                <label className="form-field">
                  <div className="form-label">Di quanti euro hai bisogno?{profile.businessExists ? ' *' : ''}</div>
                  <input
                    className={`form-control${
                      stepTwoAttempted &&
                      (profile.businessExists
                        ? !profile.targetAmount.trim()
                        : !profile.targetAmount.trim() && !profile.fundingGoal.trim())
                        ? ' is-invalid'
                        : ''
                    }`}
                    inputMode="decimal"
                    value={profile.targetAmount}
                    onChange={(event) => setProfile((prev) => ({ ...prev, targetAmount: event.target.value }))}
                    placeholder="Es. 50000"
                  />
                </label>

                <label className="form-field">
                  <div className="form-label">Tipo aiuto</div>
                  <select
                    className="form-control"
                    value={profile.aidPreference}
                    onChange={(event) => setProfile((prev) => ({ ...prev, aidPreference: event.target.value }))}
                  >
                    <option value="fondo perduto">Fondo perduto</option>
                    <option value="finanziamento agevolato">Finanziamento agevolato</option>
                    <option value="credito d'imposta">Credito d'imposta</option>
                    <option value="voucher">Voucher</option>
                    <option value="garanzia">Garanzia</option>
                    <option value="misto">Misto</option>
                  </select>
                </label>
              </div>

              <button
                type="button"
                className={showAdvanced ? 'advanced-toggle is-open' : 'advanced-toggle'}
                onClick={() => setShowAdvanced((prev) => !prev)}
                aria-expanded={showAdvanced}
              >
                {showAdvanced ? 'Nascondi dettagli' : 'Aggiungi dettagli (opzionale)'}
              </button>

              {showAdvanced ? (
                <div className="full-search-grid full-search-grid-secondary">
                  {profile.businessExists ? (
                    <>
                      <label className="form-field">
                        <div className="form-label">Dimensione</div>
                        <select
                          className="form-control"
                          value={profile.companySize}
                          onChange={(event) => setProfile((prev) => ({ ...prev, companySize: event.target.value }))}
                        >
                          <option value="">Seleziona dimensione...</option>
                          <option value="microimpresa">Microimpresa</option>
                          <option value="piccola impresa">Piccola impresa</option>
                          <option value="media impresa">Media impresa</option>
                          <option value="grande impresa">Grande impresa</option>
                        </select>
                      </label>

                      <label className="form-field">
                        <div className="form-label">Dipendenti</div>
                        <input
                          className="form-control"
                          inputMode="numeric"
                          value={profile.employees}
                          onChange={(event) => setProfile((prev) => ({ ...prev, employees: event.target.value }))}
                          placeholder="Es. 8"
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="form-field">
                        <div className="form-label">Quando vuoi aprire?</div>
                        <select
                          className="form-control"
                          value={profile.timelineMonths}
                          onChange={(event) => setProfile((prev) => ({ ...prev, timelineMonths: event.target.value }))}
                        >
                          <option value="3">Entro 3 mesi</option>
                          <option value="6">Entro 6 mesi</option>
                          <option value="12">Entro 12 mesi</option>
                          <option value="18">Oltre 12 mesi</option>
                        </select>
                      </label>

                    </>
                  )}
                </div>
              ) : null}

              <div className="full-search-actions">
                {stepTwoAttempted && !stepTwoReady ? (
                  <div className="journey-missing">
                    {profile.businessExists
                      ? 'Inserisci obiettivo e importo richiesto per procedere.'
                      : 'Per azienda da aprire basta compilare almeno uno tra obiettivo e importo.'}
                  </div>
                ) : null}
                {error ? <div className="form-error">{error}</div> : null}
                <div className="journey-actions">
                  <button type="button" className="journey-back" onClick={() => goToStep(1)}>
                    Indietro
                  </button>
                  <button type="submit" className="form-submit" disabled={matching}>
                    <span>{matching ? 'Sto cercando i bandi migliori...' : 'Trova bandi per me'}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </form>
      </section>

      <section ref={resultsRef} className="panel-card scanner-results fade-up">
        <div className="panel-head">
          <div className="panel-title">Risultati</div>
          <div className="panel-sub">{openCount} aperti · {incomingCount} in arrivo</div>
        </div>

        <div className="results-toolbar">
          <div className="results-switch" role="group" aria-label="Filtra stato bando">
            <button
              type="button"
              className={availabilityFilter === 'all' ? 'results-chip is-active' : 'results-chip'}
              onClick={() => setAvailabilityFilter('all')}
            >
              Tutti ({availableItems.length})
            </button>
            <button
              type="button"
              className={availabilityFilter === 'open' ? 'results-chip is-active' : 'results-chip'}
              onClick={() => setAvailabilityFilter('open')}
            >
              Aperti ({openCount})
            </button>
            <button
              type="button"
              className={availabilityFilter === 'incoming' ? 'results-chip is-active' : 'results-chip'}
              onClick={() => setAvailabilityFilter('incoming')}
            >
              In arrivo ({incomingCount})
            </button>
          </div>

          <label className="results-sort">
            <span>Ordina</span>
            <select
              className="form-control results-sort-select"
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
            >
              <option value="coverage">Più fondo perduto</option>
              <option value="fit">Più adatti</option>
              <option value="deadline">Scadenza più vicina</option>
              <option value="budget">Importo più alto</option>
            </select>
          </label>
        </div>

        {matchItems.length === 0 ? (
          <div className="panel-hint">Compila i dati e avvia la ricerca.</div>
        ) : visibleItems.length > 0 ? (
          <div className="result-grid">
            {visibleItems.map((item) => (
              <GrantCard key={item.grantId} item={item} requestedAid={profile.aidPreference} />
            ))}
          </div>
        ) : (
          <div className="panel-hint">Nessun bando in questo filtro ({selectedCount}). Prova un altro stato.</div>
        )}

        {nearMissItems.length > 0 ? (
          <div className="near-miss-block">
            <div className="near-miss-eyebrow">Inoltre</div>
            <h3 className="near-miss-title">Potresti anche partecipare a questi bandi</h3>
            <p className="near-miss-subtitle">Ti manca solo qualche requisito. Qui sotto trovi in modo semplice cosa serve.</p>
            <ul className="near-miss-list">
              {nearMissItems.slice(0, 4).map((item) => {
                const suggestion =
                  (item.missingRequirements ?? []).find((entry) => entry.toLowerCase().includes('potresti accedere se')) ??
                  (item.missingRequirements ?? [])[0] ??
                  'verifichi i requisiti mancanti';
                const simpleCondition = simplifyNearMissCondition(suggestion);
                return (
                  <li key={`near-${item.grantId}`}>
                    <strong>{item.grantTitle}</strong>
                    <div className="near-miss-condition">
                      <span className="near-miss-se">SE</span>
                      <span>{simpleCondition}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </section>

      <FullScreenScannerOverlay
        open={matching}
        progress={overlayProgress}
        activeStepIndex={overlayStepIndex}
        currentStepLabel={SCAN_OVERLAY_STEPS[overlayStepIndex] ?? SCAN_OVERLAY_STEPS[0]}
      />
    </div>
  );
}
