import { MARKETING_URL } from '@/shared/lib';

const QUIZ_URL = `${MARKETING_URL}/quiz/autoimpiego`;

type Practice = {
  grantId: string;
  title: string;
  badge: string;
  maxAmount: string;
  maxDetail: string;
  specs: Array<{ label: string; value: string }>;
};

const PRACTICES: Practice[] = [
  {
    grantId: '769117e6-ab97-4b8a-9ff1-bec0e14879e6',
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
    grantId: 'a13a8bde-e544-4a14-b73f-61dd0ca8fe90',
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

export function PraticheView({ 
  onVerify, 
  onOpenDetail,
  title = 'Pratiche disponibili',
  subtitle = 'Seleziona una pratica e verifica i requisiti con BNDO.'
}: { 
  onVerify?: (grantId: string) => void;
  onOpenDetail?: (grantId: string) => void;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="content-stage mobile-menu-safe">
      <div className="page-head">
        <div className="page-title">{title}</div>
        <div className="page-sub">{subtitle}</div>
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

            <div className="practice-footer" style={{ display: 'flex', gap: '8px' }}>
              {onOpenDetail && (
                <button 
                  type="button" 
                  className="practice-btn practice-btn--secondary" 
                  onClick={() => onOpenDetail(p.grantId)}
                  style={{ flex: 1, background: 'rgba(11,17,54,0.05)', color: 'var(--navy)' }}
                >
                  <span>Dettagli</span>
                </button>
              )}
              {onVerify ? (
                <button type="button" className="practice-btn" onClick={() => onVerify(p.grantId)} style={{ flex: 1 }}>
                  <span>Verifica requisiti</span>
                </button>
              ) : (
                <a className="practice-btn" href={QUIZ_URL} target="_blank" rel="noreferrer" style={{ flex: 1 }}>
                  <span>Verifica requisiti</span>
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
