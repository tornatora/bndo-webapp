export type FinanceFaq = {
  id: string;
  topic: string;
  keywords: string[];
  answer: string;
  volatile?: boolean;
};

export const FINANCE_FAQ: FinanceFaq[] = [
  {
    id: 'method',
    topic: 'Metodo BNDO',
    keywords: ['metodo', 'come funziona', 'consulenza', 'strategia', 'approccio'],
    answer:
      "Approccio BNDO: 1) obiettivo e spese reali, 2) requisiti beneficiario e territorio, 3) filtri tecnici (ATECO, dimensione, regime aiuti), 4) shortlist di bandi candidabili, 5) checklist documentale e timing operativo."
  },
  {
    id: 'forms',
    topic: 'Forme di agevolazione',
    keywords: ['fondo perduto', 'agevolato', 'voucher', 'credito', 'imposta', 'differenza', 'tipi di agevolazione', 'quali forme'],
    answer:
      "Fondo perduto: quota non restituita. Finanziamento agevolato: prestito a condizioni migliorative. Voucher: contributo mirato su spese specifiche. Credito d'imposta: beneficio in compensazione fiscale. Garanzia pubblica: strumento per facilitare l'accesso al credito bancario."
  },
  {
    id: 'de-minimis',
    topic: 'Regime de minimis',
    keywords: ['de minimis', 'aiuti', 'massimale', 'storico aiuti', 'tetto aiuti'],
    answer:
      "Il de minimis limita il totale aiuti ottenibili in un periodo pluriennale. Prima della candidatura va sempre verificato lo storico aiuti già ricevuti nel Registro Nazionale Aiuti.",
    volatile: true
  },
  {
    id: 'sportello-vs-graduatoria',
    topic: 'Sportello vs graduatoria',
    keywords: ['sportello', 'graduatoria', 'tempistiche', 'apertura', 'click day'],
    answer:
      "A sportello conta la rapidità e la completezza all'apertura (click day). A graduatoria conta soprattutto il punteggio tecnico del progetto: puoi prendere tempo per preparare una domanda più solida."
  },
  {
    id: 'ammissibili',
    topic: 'Spese ammissibili',
    keywords: ['spese', 'ammissibili', 'costi', 'investimenti', 'cosa finanzia', 'cosa copre'],
    answer:
      "Le spese ammissibili dipendono dal singolo bando; spesso includono beni strumentali, software/digitalizzazione, consulenze specialistiche e in alcuni casi opere, formazione o personale. Devo sempre verificare il bando specifico per confermare le voci esatte."
  },
  {
    id: 'documents',
    topic: 'Documenti tipici',
    keywords: ['documenti', 'visura', 'business plan', 'durc', 'preventivi', 'documentazione'],
    answer:
      "I documenti più frequenti sono visura camerale aggiornata, preventivi coerenti, progetto/business plan, dichiarazioni aiuti, DURC e documentazione anagrafico-fiscale."
  },
  {
    id: 'resto-sud',
    topic: 'Resto al Sud 2.0',
    keywords: ['resto al sud', 'invitalia sud', 'resto al sud 2.0', 'dl coesione', 'mezzogiorno avvio'],
    answer:
      "Resto al Sud 2.0 (DL Coesione 2024) è una misura specifica per l'AVVIO di nuove attività (startup, liberi professionisti) da parte di GIOVANI UNDER 35, disoccupati da almeno 6 mesi, inoccupati o lavoratori in condizioni svantaggiate. È attiva nelle regioni del Mezzogiorno (Sicilia, Sardegna, Calabria, Puglia, Basilicata, Campania, Molise, Abruzzo) e aree del sisma (Centro Italia). NON confondere con la precedente misura 'Resto al Sud' che arrivava ai 55 anni. Questa nuova versione è molto più restrittiva sull'età (Under 35). Finanzia investimenti (contributi fino al 75%) e spese di avvio (voucher fino a 50k). Per imprese già attive o soggetti over 35, questa misura NON è applicabile."
  },
  {
    id: 'autoimpiego',
    topic: 'Autoimpiego Centro Nord',
    keywords: ['autoimpiego', 'centro nord', 'avvio nord', 'nuova impresa nord', 'autoimpiego centro nord'],
    answer:
      "Autoimpiego Centro-Nord è la misura per l'avvio di attività nelle regioni del Centro e Nord Italia (non coperte da Resto al Sud). Supporta giovani e soggetti svantaggiati con contributi e finanziamenti. La coerenza delle spese (investimenti vs gestione) è fondamentale per l'ammissibilità."
  },
  {
    id: 'nuova-sabatini',
    topic: 'Nuova Sabatini',
    keywords: ['nuova sabatini', 'sabatini', 'beni strumentali macchinari', 'impianti agevolati', 'macchinari pmi', 'beni strumentali pmi'],
    answer:
      "La Nuova Sabatini (MIMIT) supporta l'acquisto o il leasing di beni strumentali nuovi (macchinari, impianti, attrezzature, hardware, software, tecnologie digitali) da parte di PMI. Prevede un finanziamento bancario e un contributo ministeriale in conto interessi. È disponibile su tutto il territorio nazionale per PMI con attività già avviata. Le aliquote e importi massimi variano: verificare sempre il decreto vigente e i plafond disponibili prima della candidatura."
  },
  {
    id: 'fusese',
    topic: 'FUSESE',
    keywords: ['fusese', 'fund for self employment', 'self entrepreneurship', 'calabria fondo occupazione'],
    answer:
      "Il FUSESE (Fund for Self Employment and Self Entrepreneurship) è una misura regionale della Calabria, gestita con fondi europei FSE+, per l'autoimpiego e l'autoimprenditorialità. Supporta giovani e soggetti svantaggiati per l'avvio di attività in Calabria. Per i requisiti precisi conviene verificare il bando vigente e la scheda ufficiale della Regione Calabria."
  },
  {
    id: 'credito-imposta-investimenti',
    topic: "Credito d'imposta investimenti",
    keywords: ["credito d'imposta investimenti", 'piano transizione 4.0', 'transizione 5.0', 'industria 4.0', 'innovazione tecnologica credito'],
    answer:
      "Il credito d'imposta per investimenti in beni strumentali (Transizione 4.0/5.0) consente alle imprese di dedurre fiscalmente quote degli investimenti in macchinari interconnessi, software, formazione 4.0. Le aliquote e i massimali variano per tipologia di bene e per anno/decreto. Non è un contributo diretto ma un risparmio fiscale. Richiede requisiti tecnici (interconnessione, certificazione). Per percentuali aggiornate verificare la circolare Agenzia Entrate più recente."
  },
  {
    id: 'pnrr',
    topic: 'PNRR e fondi europei',
    keywords: ['pnrr', 'piano nazionale ripresa', 'fondi europei', 'fesr', 'fse', 'recovery fund'],
    answer:
      "Il PNRR finanzia misure in sei aree: digitalizzazione, transizione ecologica, infrastrutture, istruzione, salute, inclusione. Le opportunità per le imprese sono erogate tramite bandi specifici dei Ministeri o Regioni. I fondi europei strutturali (FESR, FSE) sono gestiti a livello regionale con Programmi Regionali (PR). Per sapere quali misure sono attive nella tua regione, indicami il territorio e l'obiettivo."
  },
  {
    id: 'garanzia-pubblica',
    topic: 'Fondo di Garanzia PMI',
    keywords: ['fondo garanzia', 'mediocredito', 'garanzia pmi', 'accesso credito', 'fondo centrale garanzia'],
    answer:
      "Il Fondo di Garanzia per le PMI (Mediocredito Centrale) facilita l'accesso al credito bancario coprendo il rischio di insolvenza. Non eroga direttamente denaro: garantisce il prestito bancario. L'impresa si rivolge alla banca, che chiede la garanzia al Fondo. Le condizioni variano per settore, dimensione e tipologia d'investimento."
  },
  {
    id: 'timing',
    topic: 'Tempistiche bandi',
    keywords: ['quando aprono', 'apertura bando', 'scadenza bando', 'prossima apertura', 'quando candidarsi', 'bando aperto ora'],
    answer:
      "Le date di apertura e scadenza dei bandi cambiano frequentemente. Non posso garantire le date attuali senza conoscere il bando specifico. Per la situazione aggiornata conviene verificare il sito istituzionale del gestore (MIMIT, Invitalia, Regione) o il Registro Trasparente Aiuti."
  },
];
