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
      "Resto al Sud 2.0 (DL Coesione 2024) è una misura specifica per l'AVVIO di nuove attività (startup, ditta individuale, liberi professionisti) da parte di GIOVANI UNDER 35. NOVITÀ CRITICA: Prevede un VOUCHER fino a 40.000€ (50.000€ per acquisto beni tecnologici/green) a FONDO PERDUTO AL 100% per l'avvio. REQUISITI: Bisogna essere disoccupati da almeno 6 mesi, o inoccupati, o lavoratori svantaggiati. È attiva nel Mezzogiorno e aree del sisma. Se hai più di 35 anni, puoi accedere solo se in società con un Under 35 che detenga la maggioranza."
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
  {
    id: 'startup-strategy',
    topic: 'Strategia Startup',
    keywords: ['non ho azienda', 'senza azienda', 'come ricevere fondi', 'aprire per fondi', 'creare societa'],
    answer:
      "Se non hai ancora un'azienda, molti bandi (come Resto al Sud 2.0 o Nuove Imprese a Tasso Zero) ti permettono di candidarti come 'persona fisica' con l'impegno di costituire la società solo dopo l'approvazione del finanziamento. Questa è la strategia più sicura per non anticipare costi inutili."
  },
  {
    id: 'professionista-vs-ditta',
    topic: 'Libero Professionista vs Ditta',
    keywords: ['professionista', 'ditta individuale', 'partita iva', 'iscritti ordini', 'differenza'],
    answer:
      "Molti bandi regionali e voucher (es. Fiere o Digitalizzazione) ora equiparano i Liberi Professionisti alle PMI. Tuttavia, alcuni bandi sono riservati solo a chi è iscritto al Registro Imprese della Camera di Commercio. Se sei un professionista iscritto a un ordine (es. avvocato, architetto), dobbiamo verificare se lo specifico bando ammette le 'partite iva non iscritte in camera di commercio'."
  },
  {
    id: 'resto-sud-partnership',
    topic: 'Partnership Resto al Sud 2.0',
    keywords: ['socio under 35', 'oltre 35 anni', 'over 35 resto al sud', 'societa con giovane', 'maggioranza quote'],
    answer:
      "CONSIGLIO STRATEGICO: Se hai più di 35 anni, puoi comunque accedere a Resto al Sud 2.0 costituendo una società in cui almeno uno dei soci sia Under 35 e detenga la maggioranza del capitale (almeno il 51%). Questo ti permette di partecipare a una misura altrimenti preclusa."
  },
  {
    id: 'debiti',
    topic: 'Consolidamento Debiti',
    keywords: ['debiti', 'consolidamento debiti', 'pagare debiti', 'pagare tasse', 'coprire rosso', 'scoperto'],
    answer:
      "ATTENZIONE: Nessun bando pubblico a fondo perduto finanzia mai il pagamento di debiti pregressi, il rifinanziamento, o il pagamento di tasse e sanzioni. I fondi pubblici servono solo per nuovi investimenti di sviluppo o nuova liquidità per la crescita aziendale."
  },
  {
    id: 'quote-soci',
    topic: 'Acquisto Quote Societarie',
    keywords: ['comprare quote', 'rilevare quote', 'liquidare un socio', 'uscita socio', 'acquisto societa', 'rilevare azienda'],
    answer:
      "ATTENZIONE: L'acquisto di quote societarie (M&A) o la liquidazione di un socio uscente NON sono operazioni finanziabili con contributi a fondo perduto. I bandi supportano l'acquisto di beni strumentali, assunzioni, o servizi, ma raramente i passaggi di proprietà aziendale puri."
  },
  {
    id: 'auto-privata',
    topic: 'Acquisto Auto Privata',
    keywords: ['macchina nuova', 'auto per me', 'comprare macchina', 'veicolo privato', 'uso personale'],
    answer:
      "ATTENZIONE: I bandi di finanza agevolata finanziano solo veicoli AZIENDALI ad uso esclusivo dell'attività (furgoni, autocarri, veicoli speciali o auto immatricolate come autocarri). L'acquisto di un'auto per uso privato o personale NON è mai finanziabile."
  },
  {
    id: 'affitto-turistico',
    topic: 'Affitto Turistico Privato',
    keywords: ['casa vacanze', 'airbnb', 'affittacamere privato', 'rendita'],
    answer:
      "ATTENZIONE: Per ricevere contributi nel settore turistico, è necessario operare come Impresa (es. Società, Ditta Individuale) o struttura regolarmente iscritta ai registri regionali. Gli affitti brevi gestiti da privati in forma non imprenditoriale sono generalmente esclusi dai bandi."
  },
  {
    id: 'tasse-sanzioni',
    topic: 'Tasse e Sanzioni',
    keywords: ['pagare tasse', 'cartelle esattoriali', 'multe', 'sanzioni', 'iva'],
    answer:
      "ATTENZIONE: Nessun bando pubblico può finanziare il pagamento di tasse, imposte, IVA (se detraibile), o sanzioni amministrative. I fondi pubblici sono destinati esclusivamente a nuovi progetti di sviluppo."
  },
  {
    id: 'smart-start',
    topic: 'Smart&Start Italia',
    keywords: ['smart and start', 'startup innovative', 'smart&start', 'invitalia startup'],
    answer:
      "Smart&Start Italia (Invitalia) è il bando principale per le STARTUP INNOVATIVE. Finanzia piani di impresa tra 100.000€ e 1,5 milioni di€ con mutuo a tasso zero (fino all'80% delle spese) e una quota a fondo perduto per le startup del Sud o fondate da donne/giovani. Copre acquisto beni strumentali, servizi cloud, personale e consulenze."
  },
  {
    id: 'on-tasso-zero',
    topic: 'ON - Oltre Nuove Imprese a Tasso Zero',
    keywords: ['oltre nuove imprese', 'on tasso zero', 'donne giovani invitalia', 'nuove imprese giovani', 'finanziamento donne'],
    answer:
      "Oltre Nuove Imprese a Tasso Zero (ON) è rivolto a micro e piccole imprese composte prevalentemente da GIOVANI (18-35 anni) o DONNE (senza limiti di età). Supporta l'avvio o lo sviluppo di imprese nei settori manifatturiero, servizi, commercio e turismo. Offre un mix di finanziamento a tasso zero e fondo perduto (fino al 90% delle spese ammissibili)."
  },
  {
    id: 'voucher-export',
    topic: 'Voucher Internazionalizzazione',
    keywords: ['voucher export', 'voucher internazionalizzazione', 'tem manager', 'mercati esteri', 'export pmi'],
    answer:
      "Il Voucher per l'Internazionalizzazione supporta le PMI che vogliono espandersi sui mercati esteri tramite l'inserimento temporaneo in azienda di un Temporary Export Manager (TEM) o Digital Temporary Export Manager (D-TEM). Aiuta a strutturare strategie di export, ricerca partner e gestione di marketplace internazionali."
  },
  {
    id: 'fondo-competenze',
    topic: 'Fondo Nuove Competenze',
    keywords: ['fondo nuove competenze', 'anpal competenze', 'formazione dipendenti', 'formazione finanziata'],
    answer:
      "Il Fondo Nuove Competenze (Anpal) rimborsa alle imprese il costo del personale (contributi e parte del salario) per le ore destinate alla FORMAZIONE dei dipendenti in seguito a innovazioni tecnologiche o organizzative. Permette di aggiornare le competenze della forza lavoro a costo quasi zero per l'azienda."
  },
  {
    id: 'transizione-5-0',
    topic: 'Transizione 5.0',
    keywords: ['transizione 5.0', 'credito imposta 5.0', 'risparmio energetico', 'industria 5.0', 'bonus energia'],
    answer:
      "Transizione 5.0 è l'evoluzione del piano 4.0, focalizzata sul RISPARMIO ENERGETICO. Offre crediti d'imposta per investimenti in beni strumentali (4.0) che portino a una riduzione certificata dei consumi energetici (almeno il 3% per l'azienda o il 5% per il processo). Include anche impianti per l'autoconsumo da fonti rinnovabili e formazione."
  }
];
