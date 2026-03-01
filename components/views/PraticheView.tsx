'use client';

const QUIZ_URL = 'https://bndo.it/quiz/autoimpiego';

type Practice = {
  title: string;
  badge: string;
  maxAmount: string;
  maxDetail: string;
  specs: Array<{ label: string; value: string }>;
};

const PRACTICES: Practice[] = [
  {
    title: 'Resto al Sud 2.0',
    badge: 'Abruzzo, Basilicata, Calabria, Campania, Molise, Puglia, Sardegna, Sicilia',
    maxAmount: '€200k',
    maxDetail: 'fino al 75% a fondo perduto',
    specs: [
      { label: 'Eta', value: '18-35 anni non compiuti' },
      { label: 'Requisiti', value: 'Disoccupato, inoccupato, inattivo, working poor, GOL' },
      { label: 'Voucher', value: '€40k-50k 100% a fondo perduto' },
      { label: 'Programma ≤€120k', value: '75% a fondo perduto' },
      { label: 'Programma €120k-200k', value: '70% a fondo perduto' },
      { label: 'Settori', value: 'Tutti (escluso agricoltura/pesca)' },
      { label: 'Scadenza', value: 'A sportello fino a esaurimento fondi' }
    ]
  },
  {
    title: 'Autoimpiego Centro Nord',
    badge: "Piemonte, Valle d'Aosta, Liguria, Lombardia, Veneto, Friuli, Trentino, Emilia-R., Toscana, Lazio, Umbria, Marche",
    maxAmount: '€200k',
    maxDetail: 'fino al 65% a fondo perduto',
    specs: [
      { label: 'Eta', value: '18-35 anni non compiuti' },
      { label: 'Requisiti', value: 'Disoccupato, inoccupato, inattivo, working poor, GOL' },
      { label: 'Voucher', value: '€30k-40k 100% a fondo perduto' },
      { label: 'Programma ≤€120k', value: '65% a fondo perduto' },
      { label: 'Programma €120k-200k', value: '60% a fondo perduto' },
      { label: 'Settori', value: 'Industria, artigianato, servizi, turismo, commercio' },
      { label: 'Scadenza', value: 'A sportello fino a esaurimento fondi' }
    ]
  }
];

export function PraticheView() {
  return (
    <div className="content-stage mobile-menu-safe">
      <div className="page-head">
        <div className="page-title">Pratiche disponibili</div>
        <div className="page-sub">Seleziona una pratica e verifica i requisiti con BNDO.</div>
      </div>

      <div className="practice-grid">
        {PRACTICES.map((p) => (
          <div key={p.title} className="practice-card">
            <div className="practice-top">
              <div className="practice-title">{p.title}</div>
              <div className="practice-badge">{p.badge}</div>
            </div>

            <div className="practice-amount">
              <div className="practice-amount-label">Contributo massimo</div>
              <div className="practice-amount-value">{p.maxAmount}</div>
              <div className="practice-amount-detail">{p.maxDetail}</div>
            </div>

            <div className="practice-specs">
              {p.specs.map((s) => (
                <div key={s.label} className="practice-row">
                  <div className="practice-k">{s.label}</div>
                  <div className="practice-v">{s.value}</div>
                </div>
              ))}
            </div>

            <div className="practice-footer">
              <a className="practice-btn" href={QUIZ_URL} target="_blank" rel="noreferrer">
                <span>Verifica requisiti</span>
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
