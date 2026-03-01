'use client';

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
};

export function BandiResults({
  explanation,
  results,
  nearMisses = [],
}: {
  explanation: string;
  results: BandoResult[];
  nearMisses?: BandoResult[];
}) {
  return (
    <div className="results-wrap">
      <div className="results-explanation">{explanation}</div>
      <div className="results-list">
        {results.map((bando) => (
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

            <div className="result-meta">
              <div className="result-meta-row">
                <span className="result-meta-k">Ente</span>
                <span className="result-meta-v">{bando.authorityName}</span>
              </div>
              <div className="result-meta-row">
                <span className="result-meta-k">Fonte</span>
                <a className="result-link" href={bando.sourceUrl} target="_blank" rel="noreferrer">
                  Apri link
                </a>
              </div>
            </div>

            {bando.matchReasons?.length ? (
              <div className="result-why">
                {bando.matchReasons.slice(0, 3).map((reason, idx) => (
                  <div key={idx} className="result-why-pill">
                    {reason}
                  </div>
                ))}
              </div>
            ) : null}

            {bando.requirements.length ? (
              <div className="result-req">
                {bando.requirements.slice(0, 5).map((req, idx) => (
                  <div key={idx} className="req-pill">
                    {req}
                  </div>
                ))}
              </div>
            ) : null}

            {bando.mismatchFlags?.length ? (
              <div className="result-mismatch">
                {bando.mismatchFlags.slice(0, 2).join(' · ')}
              </div>
            ) : null}
          </div>
        ))}
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
                <a className="near-miss-link" href={bando.sourceUrl} target="_blank" rel="noreferrer">
                  Fonte ufficiale
                </a>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
