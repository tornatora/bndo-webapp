'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const LEGACY_AUTOIMPIEGO_QUIZ_URL = 'https://bndo.it/quiz/autoimpiego';

type CatalogItem = {
  grantId: string;
  title: string;
  authorityName: string;
  aidForm: string;
  aidType: string;
  incentiveAmountLabel: string;
  deadlineAt: string | null;
  sourceUrl: string;
  isLegacyQuizGrant: boolean;
  freshnessBadge: 'Uscito oggi' | 'Uscito ieri' | 'Uscito questa settimana' | null;
  isNew: boolean;
  isExpiringSoon: boolean;
};

type CatalogResponse = {
  items: CatalogItem[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  universeCount: number;
};

const DEFAULT_LIMIT = 12;
let catalogBootstrapData: CatalogResponse | null = null;
let catalogBootstrapPromise: Promise<CatalogResponse> | null = null;

function buildCatalogParams(paramsInput: {
  page: number;
  limit?: number;
  query?: string;
  aidType?: string;
  deadlineWindow?: string;
  authorityFilter?: string;
  sectorFilter?: string;
  beneficiaryFilter?: string;
  regionFilter?: string;
  geoScope?: string;
  publishedWindow?: string;
  expiringSoonFilter?: string;
  amountMin?: string;
  amountMax?: string;
  sortBy?: string;
}) {
  const params = new URLSearchParams();
  params.set('page', String(paramsInput.page));
  params.set('limit', String(paramsInput.limit ?? DEFAULT_LIMIT));
  if ((paramsInput.query ?? '').trim()) params.set('q', (paramsInput.query ?? '').trim());
  if ((paramsInput.aidType ?? 'all') !== 'all') params.set('aidType', paramsInput.aidType ?? 'all');
  if ((paramsInput.deadlineWindow ?? 'all') !== 'all') params.set('deadlineWindow', paramsInput.deadlineWindow ?? 'all');
  if ((paramsInput.authorityFilter ?? '').trim()) params.set('authority', (paramsInput.authorityFilter ?? '').trim());
  if ((paramsInput.sectorFilter ?? '').trim()) params.set('sector', (paramsInput.sectorFilter ?? '').trim());
  if ((paramsInput.beneficiaryFilter ?? '').trim()) params.set('beneficiary', (paramsInput.beneficiaryFilter ?? '').trim());
  if ((paramsInput.regionFilter ?? '').trim()) params.set('region', (paramsInput.regionFilter ?? '').trim());
  if ((paramsInput.geoScope ?? 'all') !== 'all') params.set('geoScope', paramsInput.geoScope ?? 'all');
  if ((paramsInput.publishedWindow ?? 'all') !== 'all') params.set('publishedWindow', paramsInput.publishedWindow ?? 'all');
  if ((paramsInput.expiringSoonFilter ?? 'all') !== 'all') params.set('expiringSoon', paramsInput.expiringSoonFilter ?? 'all');
  if ((paramsInput.amountMin ?? '').trim()) params.set('amountMin', (paramsInput.amountMin ?? '').trim());
  if ((paramsInput.amountMax ?? '').trim()) params.set('amountMax', (paramsInput.amountMax ?? '').trim());
  if ((paramsInput.sortBy ?? 'deadline') !== 'deadline') params.set('sort', paramsInput.sortBy ?? 'deadline');
  return params;
}

async function fetchCatalog(params: URLSearchParams): Promise<CatalogResponse> {
  const response = await fetch(`/api/catalog/grants?${params.toString()}`, { cache: 'no-store' });
  const payload = (await response.json().catch(() => null)) as CatalogResponse | { error?: string } | null;
  if (!response.ok) {
    throw new Error((payload as { error?: string } | null)?.error ?? 'Errore nel caricamento catalogo.');
  }
  return payload as CatalogResponse;
}

export async function prefetchCatalogBootstrap(): Promise<CatalogResponse> {
  if (catalogBootstrapData) return catalogBootstrapData;
  if (catalogBootstrapPromise) return catalogBootstrapPromise;
  const params = buildCatalogParams({ page: 1, limit: DEFAULT_LIMIT });
  catalogBootstrapPromise = fetchCatalog(params)
    .then((payload) => {
      catalogBootstrapData = payload;
      return payload;
    })
    .finally(() => {
      catalogBootstrapPromise = null;
    });
  return catalogBootstrapPromise;
}

type BandiCatalogViewProps = {
  title?: string;
  subtitle?: string;
  onOpenDetail?: (grantId: string) => void;
  onVerify?: (grantId: string) => void;
};

function formatDeadline(value: string | null): string {
  if (!value) return 'Scadenza non indicata';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Scadenza non indicata';
  return `Scadenza: ${date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}`;
}

function openLegacyAutoimpiegoQuiz() {
  window.location.href = LEGACY_AUTOIMPIEGO_QUIZ_URL;
}

export function BandiCatalogView({
  title = 'Catalogo Bandi',
  subtitle = 'Tutti i bandi attivi da fonti italiane',
  onOpenDetail,
  onVerify,
}: BandiCatalogViewProps) {
  const [items, setItems] = useState<CatalogItem[]>(() => catalogBootstrapData?.items ?? []);
  const [page, setPage] = useState(() => catalogBootstrapData?.page ?? 1);
  const [limit, setLimit] = useState(() => catalogBootstrapData?.limit ?? DEFAULT_LIMIT);
  const [total, setTotal] = useState(() => catalogBootstrapData?.total ?? 0);
  const [universeCount, setUniverseCount] = useState(() => catalogBootstrapData?.universeCount ?? 0);
  const [query, setQuery] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [aidType, setAidType] = useState('all');
  const [deadlineWindow, setDeadlineWindow] = useState('all');
  const [authorityFilter, setAuthorityFilter] = useState('');
  const [sectorFilter, setSectorFilter] = useState('');
  const [beneficiaryFilter, setBeneficiaryFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [geoScope, setGeoScope] = useState('all');
  const [publishedWindow, setPublishedWindow] = useState('all');
  const [expiringSoonFilter, setExpiringSoonFilter] = useState('all');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [sortBy, setSortBy] = useState('deadline');
  const [loading, setLoading] = useState(() => !catalogBootstrapData);
  const [error, setError] = useState<string | null>(null);
  const didBootRef = useRef(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / Math.max(1, limit))), [total, limit]);
  const paginationPages = useMemo(() => {
    const pages = new Set<number>([1, totalPages, page - 1, page, page + 1, page - 2, page + 2]);
    return [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  }, [page, totalPages]);

  const applyCatalogPayload = useCallback((safePayload: CatalogResponse) => {
    setPage(safePayload.page);
    setLimit(safePayload.limit);
    setTotal(safePayload.total);
    setUniverseCount(safePayload.universeCount);
    setItems(safePayload.items);
  }, []);

  const fetchPage = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);

    try {
      const params = buildCatalogParams({
        page: targetPage,
        limit: DEFAULT_LIMIT,
        query,
        aidType,
        deadlineWindow,
        authorityFilter,
        sectorFilter,
        beneficiaryFilter,
        regionFilter,
        geoScope,
        publishedWindow,
        expiringSoonFilter,
        amountMin,
        amountMax,
        sortBy,
      });
      const safePayload = await fetchCatalog(params);
      applyCatalogPayload(safePayload);
      const isDefaultBootstrap =
        targetPage === 1 &&
        !query.trim() &&
        aidType === 'all' &&
        deadlineWindow === 'all' &&
        !authorityFilter.trim() &&
        !sectorFilter.trim() &&
        !beneficiaryFilter.trim() &&
        !regionFilter.trim() &&
        geoScope === 'all' &&
        publishedWindow === 'all' &&
        expiringSoonFilter === 'all' &&
        !amountMin.trim() &&
        !amountMax.trim() &&
        sortBy === 'deadline';
      if (isDefaultBootstrap) {
        catalogBootstrapData = safePayload;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nel caricamento catalogo.');
    } finally {
      setLoading(false);
    }
  }, [
    aidType,
    authorityFilter,
    beneficiaryFilter,
    deadlineWindow,
    expiringSoonFilter,
    geoScope,
    publishedWindow,
    query,
    regionFilter,
    sectorFilter,
    amountMin,
    amountMax,
    sortBy,
    applyCatalogPayload,
  ]);

  const openDetail = useCallback((grantId: string) => {
    if (onOpenDetail) onOpenDetail(grantId);
    else window.location.href = `/dashboard/new-practice?mode=detail&grantId=${encodeURIComponent(grantId)}&source=scanner`;
  }, [onOpenDetail]);

  const openVerify = useCallback((item: CatalogItem) => {
    if (item.isLegacyQuizGrant) {
      openLegacyAutoimpiegoQuiz();
      return;
    }
    if (onVerify) onVerify(item.grantId);
    else window.location.href = `/dashboard/new-practice?mode=quiz&grantId=${encodeURIComponent(item.grantId)}&source=scanner`;
  }, [onVerify]);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      if (!didBootRef.current) {
        didBootRef.current = true;
        if (catalogBootstrapData) {
          applyCatalogPayload(catalogBootstrapData);
          setLoading(false);
          return;
        }
        if (catalogBootstrapPromise) {
          setLoading(true);
          try {
            const payload = await catalogBootstrapPromise;
            if (cancelled) return;
            applyCatalogPayload(payload);
            setLoading(false);
            return;
          } catch {
            if (cancelled) return;
          }
        }
      }
      await fetchPage(1);
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, [fetchPage, applyCatalogPayload]);

  return (
    <div className="content-stage mobile-menu-safe catalog-content-stage">
      <div className="page-head">
        <div className="page-title">{title}</div>
        <div className="page-sub">{subtitle}</div>
      </div>

      <div className="catalog-toolbar">
        <div className="catalog-search-wrap">
          <input
            className="catalog-search-input"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Cerca per titolo, ente o tipo incentivo..."
          />
          <button
            type="button"
            className="catalog-search-btn"
            onClick={() => {
              setQuery(searchValue.trim());
              setPage(1);
            }}
          >
            Cerca
          </button>
        </div>

        <div className="catalog-toolbar-actions">
          <label className="catalog-sort-inline">
            <span>Ordina per</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="deadline">Scadenza più vicina</option>
              <option value="newest">Più recenti</option>
              <option value="fondo_perduto_first">Fondo perduto prima</option>
              <option value="amount_desc">Importo più alto</option>
              <option value="title">Ordine alfabetico</option>
            </select>
          </label>
          <button type="button" className="catalog-advanced-btn" onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? 'Chiudi filtri avanzati' : 'Filtri avanzati'}
          </button>
        </div>
      </div>

      {showAdvanced ? (
        <div className="catalog-advanced-panel">
          <label className="catalog-field">
            <span>Tipo incentivo</span>
            <select value={aidType} onChange={(event) => setAidType(event.target.value)}>
              <option value="all">Tutti</option>
              <option value="fondo_perduto">Contributo a fondo perduto</option>
              <option value="finanziamento_agevolato">Finanziamento agevolato</option>
              <option value="credito_imposta">Credito d&apos;imposta</option>
              <option value="voucher">Voucher</option>
              <option value="altro">Altri incentivi</option>
            </select>
          </label>
          <label className="catalog-field">
            <span>Scadenza</span>
            <select value={deadlineWindow} onChange={(event) => setDeadlineWindow(event.target.value)}>
              <option value="all">Qualsiasi data</option>
              <option value="30">Entro 30 giorni</option>
              <option value="60">Entro 60 giorni</option>
              <option value="90">Entro 90 giorni</option>
            </select>
          </label>
          <label className="catalog-field">
            <span>Ente erogatore</span>
            <input
              value={authorityFilter}
              onChange={(event) => setAuthorityFilter(event.target.value)}
              placeholder="Es. Invitalia, Regione Calabria..."
            />
          </label>
          <label className="catalog-field">
            <span>Settore</span>
            <input
              value={sectorFilter}
              onChange={(event) => setSectorFilter(event.target.value)}
              placeholder="Es. agricoltura, turismo, digitale"
            />
          </label>
          <label className="catalog-field">
            <span>Destinatari</span>
            <input
              value={beneficiaryFilter}
              onChange={(event) => setBeneficiaryFilter(event.target.value)}
              placeholder="Es. PMI, startup, professionisti"
            />
          </label>
          <label className="catalog-field">
            <span>Regione / territorio</span>
            <input
              value={regionFilter}
              onChange={(event) => setRegionFilter(event.target.value)}
              placeholder="Es. Calabria, Lombardia, tutta Italia"
            />
          </label>
          <label className="catalog-field">
            <span>Ambito geografico</span>
            <select value={geoScope} onChange={(event) => setGeoScope(event.target.value)}>
              <option value="all">Qualsiasi ambito</option>
              <option value="nazionale">Nazionale</option>
              <option value="territoriale">Regionale / locale</option>
            </select>
          </label>
          <label className="catalog-field">
            <span>Pubblicazione</span>
            <select value={publishedWindow} onChange={(event) => setPublishedWindow(event.target.value)}>
              <option value="all">Qualsiasi data</option>
              <option value="1">Pubblicato oggi</option>
              <option value="7">Ultimi 7 giorni</option>
              <option value="30">Ultimi 30 giorni</option>
            </select>
          </label>
          <label className="catalog-field">
            <span>Stato scadenza</span>
            <select value={expiringSoonFilter} onChange={(event) => setExpiringSoonFilter(event.target.value)}>
              <option value="all">Tutti</option>
              <option value="yes">Solo scadenza imminente (15 giorni)</option>
            </select>
          </label>
          <label className="catalog-field">
            <span>Importo minimo (€)</span>
            <input
              value={amountMin}
              onChange={(event) => setAmountMin(event.target.value.replace(/[^\d]/g, ''))}
              placeholder="Es. 50000"
            />
          </label>
          <label className="catalog-field">
            <span>Importo massimo (€)</span>
            <input
              value={amountMax}
              onChange={(event) => setAmountMax(event.target.value.replace(/[^\d]/g, ''))}
              placeholder="Es. 500000"
            />
          </label>
          <div className="catalog-advanced-actions">
            <button
              type="button"
              className="catalog-search-btn"
              onClick={() => {
                setPage(1);
                void fetchPage(1);
              }}
            >
              Applica filtri
            </button>
            <button
              type="button"
              className="catalog-reset-btn"
              onClick={() => {
                setAidType('all');
                setDeadlineWindow('all');
                setAuthorityFilter('');
                setSectorFilter('');
                setBeneficiaryFilter('');
                setRegionFilter('');
                setGeoScope('all');
                setPublishedWindow('all');
                setExpiringSoonFilter('all');
                setAmountMin('');
                setAmountMax('');
                setSortBy('deadline');
                setSearchValue('');
                setQuery('');
                setPage(1);
              }}
            >
              Azzera
            </button>
          </div>
        </div>
      ) : null}

      <div className="catalog-summary-box">
        <strong>{universeCount.toLocaleString('it-IT')}</strong> bandi attivi disponibili nel catalogo
      </div>

      {error ? <div className="catalog-alert">{error}</div> : null}

      {loading ? <div className="catalog-loading">Sto caricando il catalogo bandi...</div> : null}

      {!loading && items.length === 0 ? (
        <div className="catalog-empty">Nessun bando disponibile al momento.</div>
      ) : null}

      {!loading && items.length > 0 ? (
        <>
          <div className="catalog-grid">
            {items.map((item) => (
              <article
                key={item.grantId}
                className="catalog-card"
                role="button"
                tabIndex={0}
                onClick={() => {
                  openDetail(item.grantId);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openDetail(item.grantId);
                  }
                }}
              >
                <h3 className="catalog-card-title">{item.title}</h3>
                <p className="catalog-card-authority">{item.authorityName}</p>
                <div className="catalog-card-meta">
                  <div className="catalog-top-tags">
                    <span className="catalog-pill">{item.aidForm}</span>
                    {item.freshnessBadge ? <span className="catalog-badge-new">{item.freshnessBadge}</span> : null}
                    {item.isExpiringSoon ? <span className="catalog-badge-soon">Scadenza imminente</span> : null}
                  </div>
                  <span className="catalog-amount">{item.incentiveAmountLabel}</span>
                  <span className="catalog-deadline">{formatDeadline(item.deadlineAt)}</span>
                </div>
                <div className="catalog-card-actions">
                  <button
                    type="button"
                    className="practice-btn practice-btn--secondary catalog-action-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      openDetail(item.grantId);
                    }}
                  >
                    <span>Vedi dettagli</span>
                  </button>
                  <button
                    type="button"
                    className="practice-btn catalog-action-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      openVerify(item);
                    }}
                  >
                    <span>Verifica requisiti</span>
                  </button>
                </div>
              </article>
            ))}
          </div>

          {totalPages > 1 ? (
            <div className="catalog-pagination">
              <button
                type="button"
                className="catalog-page-btn"
                disabled={page <= 1 || loading}
                onClick={() => void fetchPage(Math.max(1, page - 1))}
              >
                ←
              </button>
              {paginationPages.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`catalog-page-btn ${p === page ? 'is-active' : ''}`}
                  disabled={loading}
                  onClick={() => void fetchPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                className="catalog-page-btn"
                disabled={page >= totalPages || loading}
                onClick={() => void fetchPage(Math.min(totalPages, page + 1))}
              >
                →
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
