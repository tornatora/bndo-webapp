export type FinanceFaq = {
  id: string;
  topic: string;
  keywords: string[];
  answer: string;
  volatile?: boolean;
};

export const FINANCE_FAQ: FinanceFaq[] = [
  // ─── FONDAMENTALI ────────────────────────────────────────────────────────────
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
      "Fondo perduto: quota non restituita. Finanziamento agevolato: prestito a condizioni migliorative (tasso zero o ridotto). Voucher: contributo mirato su spese specifiche. Credito d'imposta: beneficio in compensazione fiscale (riduce le tasse da pagare, non è liquidità diretta). Garanzia pubblica: facilita l'accesso al credito bancario senza eroga direttamente denaro. Molte misure combinano più forme insieme."
  },
  {
    id: 'de-minimis',
    topic: 'Regime de minimis',
    keywords: ['de minimis', 'aiuti', 'massimale', 'storico aiuti', 'tetto aiuti', 'registro nazionale aiuti', 'rna'],
    answer:
      "Il de minimis limita il totale di aiuti pubblici ottenibili in 3 anni fiscali consecutivi. Dal 2024 il massimale è salito a 300.000€ (era 200.000€). Prima della candidatura va verificato lo storico aiuti nel Registro Nazionale Aiuti (RNA). Settori esclusi dal de minimis: pesca, acquacoltura, produzione agricola primaria (che hanno propri massimali). Il de minimis è cumulabile con altri aiuti purché non si superino le intensità massime per categoria di spesa.",
    volatile: true
  },
  {
    id: 'sportello-vs-graduatoria',
    topic: 'Sportello vs graduatoria',
    keywords: ['sportello', 'graduatoria', 'tempistiche', 'apertura', 'click day'],
    answer:
      "A sportello conta la rapidità e la completezza all'apertura (click day): chi arriva prima esaurisce le risorse, quindi bisogna prepararsi in anticipo. A graduatoria conta il punteggio tecnico del progetto: puoi prendere più tempo per preparare una domanda più solida, perché l'ordine cronologico non conta."
  },
  {
    id: 'ammissibili',
    topic: 'Spese ammissibili',
    keywords: ['spese', 'ammissibili', 'costi', 'investimenti', 'cosa finanzia', 'cosa copre'],
    answer:
      "Le spese ammissibili dipendono dal singolo bando; spesso includono beni strumentali, software, digitalizzazione, consulenze specialistiche e in alcuni casi opere edili (con limiti percentuali), formazione o personale. Le spese di gestione corrente (affitti, utenze, stipendi ordinari) sono quasi sempre escluse. Devo sempre verificare il disciplinare del bando specifico per confermare le voci esatte."
  },
  {
    id: 'documents',
    topic: 'Documenti tipici',
    keywords: ['documenti', 'visura', 'business plan', 'durc', 'preventivi', 'documentazione'],
    answer:
      "I documenti più frequenti sono visura camerale aggiornata, preventivi coerenti e intestati, progetto/business plan, dichiarazione aiuti ricevuti (de minimis), DURC regolare, documentazione anagrafico-fiscale. Per misure con istruttoria bancaria si aggiunge il merito creditizio. I preventivi devono essere comparativi (almeno 2 o 3) per spese sopra certe soglie."
  },
  {
    id: 'timing',
    topic: 'Tempistiche bandi',
    keywords: ['quando aprono', 'apertura bando', 'scadenza bando', 'prossima apertura', 'quando candidarsi', 'bando aperto ora'],
    answer:
      "Le date di apertura e scadenza cambiano frequentemente. La fonte più affidabile è sempre il sito istituzionale del gestore (MIMIT, Invitalia, Regione, Camera di Commercio) o il portale OpenCoesione. Non posso garantire le date attuali senza conoscere il bando specifico."
  },

  // ─── MISURE NAZIONALI PRINCIPALI ────────────────────────────────────────────
  {
    id: 'resto-sud',
    topic: 'Resto al Sud 2.0',
    keywords: ['resto al sud', 'invitalia sud', 'resto al sud 2.0', 'dl coesione', 'mezzogiorno avvio', 'avvio mezzogiorno'],
    answer:
      "Resto al Sud 2.0 (DL Coesione 2024) finanzia l'AVVIO di nuove attività nel Mezzogiorno e aree Sisma. Destinatari principali: under 35 disoccupati (da almeno 6 mesi), inoccupati o working poor. Gli over 35 possono accedere esclusivamente in forma societaria, purché i soci under 35 (disoccupati) detengano almeno il 51% delle quote. Prevede un voucher fino a 50.000€ al 100% fondo perduto per l'avvio e contributi per investimenti fino a 200.000€. Requisito chiave: non essere già titolari di Partita IVA attiva per la medesima attività al momento della domanda.",
  },
  {
    id: 'autoimpiego',
    topic: 'Autoimpiego Centro-Nord',
    keywords: ['autoimpiego', 'centro nord', 'avvio nord', 'nuova impresa nord', 'autoimpiego centro nord'],
    answer:
      "Autoimpiego Centro-Nord è la misura per l'avvio di attività nelle regioni del Centro e Nord Italia non coperte da Resto al Sud. Supporta giovani e soggetti svantaggiati con un mix di finanziamento agevolato e fondo perduto per avviare microimprese nei settori produzione, servizi e commercio. La coerenza tra spese previste e piano di attività è fondamentale per l'ammissibilità."
  },
  {
    id: 'nuova-sabatini',
    topic: 'Nuova Sabatini',
    keywords: ['nuova sabatini', 'sabatini', 'beni strumentali macchinari', 'impianti agevolati', 'macchinari pmi', 'beni strumentali pmi'],
    answer:
      "La Nuova Sabatini (MIMIT) supporta l'acquisto o il leasing di beni strumentali NUOVI (macchinari, impianti, attrezzature, hardware, software, tecnologie digitali) da parte di PMI con attività già avviata. Il meccanismo prevede un finanziamento bancario che la banca concede, mentre il MIMIT eroga un contributo in conto interessi (non il denaro diretto). È disponibile su tutto il territorio nazionale. Le spese di ristrutturazione, i beni usati e le spese di gestione non sono ammissibili."
  },
  {
    id: 'smart-start',
    topic: 'Smart&Start Italia',
    keywords: ['smart and start', 'startup innovative', 'smart&start', 'invitalia startup'],
    answer:
      "Smart&Start Italia (Invitalia) è il principale bando per le STARTUP INNOVATIVE. Finanzia piani di impresa tra 100.000€ e 1,5 milioni con mutuo a tasso zero (fino all'80% delle spese ammissibili) e una quota a fondo perduto per startup del Mezzogiorno o fondate da donne/giovani under 36. Copre beni strumentali, servizi cloud, personale qualificato e consulenze. Richiede che la società sia iscritta come startup innovativa nel Registro Imprese (L. 221/2012)."
  },
  {
    id: 'on-tasso-zero',
    topic: 'ON - Oltre Nuove Imprese a Tasso Zero',
    keywords: ['oltre nuove imprese', 'on tasso zero', 'donne giovani invitalia', 'nuove imprese giovani', 'finanziamento donne'],
    answer:
      "Oltre Nuove Imprese a Tasso Zero (ON) è rivolto a micro e piccole imprese composte prevalentemente da GIOVANI (18-35 anni) o DONNE (senza limiti di età). Supporta l'avvio o lo sviluppo di imprese nei settori manifatturiero, servizi, commercio e turismo con finanziamento a tasso zero e fondo perduto fino al 90% delle spese. Il piano può arrivare a 1,5 milioni di euro."
  },
  {
    id: 'fusese',
    topic: 'FUSESE',
    keywords: ['fusese', 'fund for self employment', 'self entrepreneurship', 'calabria fondo occupazione'],
    answer:
      "Il FUSESE (Fund for Self Employment and Self Entrepreneurship) è una misura regionale della Calabria, gestita con fondi europei FSE+, per l'autoimpiego e l'autoimprenditorialità. Supporta giovani e soggetti svantaggiati per l'avvio di attività in Calabria. I requisiti precisi variano per sportello, conviene verificare il bando vigente sulla scheda ufficiale della Regione Calabria."
  },
  {
    id: 'voucher-export',
    topic: 'Voucher Internazionalizzazione',
    keywords: ['voucher export', 'voucher internazionalizzazione', 'tem manager', 'mercati esteri', 'export pmi'],
    answer:
      "Il Voucher per l'Internazionalizzazione supporta le PMI che vogliono espandersi sui mercati esteri tramite l'inserimento temporaneo in azienda di un Temporary Export Manager (TEM) o Digital Temporary Export Manager (D-TEM). Copre parte del compenso del manager esterno. Non finanzia viaggi, fiere o marketing diretto: solo il costo del manager specializzato. Gestito dal MIMIT, disponibile più volte l'anno con finestre temporali."
  },
  {
    id: 'fondo-competenze',
    topic: 'Fondo Nuove Competenze',
    keywords: ['fondo nuove competenze', 'anpal competenze', 'formazione dipendenti', 'formazione finanziata'],
    answer:
      "Il Fondo Nuove Competenze (ora gestito da ANPAL/MLPS) rimborsa alle imprese il costo del personale (contributi e parte del salario) per le ore destinate alla formazione dei dipendenti in seguito a innovazioni tecnologiche o organizzative. Permette di aggiornare le competenze della forza lavoro a costo quasi zero per l'azienda. Richiede accordo sindacale aziendale o territoriale."
  },
  {
    id: 'transizione-40',
    topic: 'Transizione 4.0',
    keywords: ['transizione 4.0', 'industria 4.0', 'piano transizione', 'beni interconnessi', 'credito imposta 4.0'],
    answer:
      "Il piano Transizione 4.0 offre crediti d'imposta per investimenti in beni strumentali tecnologici (macchinari interconnessi, software, sistemi ERP, robot collaborativi). Il beneficio non è liquidità diretta ma riduzione delle imposte da pagare. Le aliquote variano per anno e tipologia di bene (beni materiali 4.0 vs beni immateriali). Requisito chiave: il bene deve essere INTERCONNESSO al sistema informatico aziendale. Richiede perizia giurata e dichiarazione del fornitore."
  },
  {
    id: 'transizione-50',
    topic: 'Transizione 5.0',
    keywords: ['transizione 5.0', 'credito imposta 5.0', 'risparmio energetico', 'industria 5.0', 'bonus energia'],
    answer:
      "Transizione 5.0 è l'evoluzione del piano 4.0, focalizzata sul RISPARMIO ENERGETICO. Offre crediti d'imposta per investimenti in beni strumentali (compatibili 4.0) che portino a una riduzione certificata dei consumi energetici (almeno 3% per l'azienda o 5% per il processo produttivo). Include anche impianti per l'autoconsumo da fonti rinnovabili e formazione specifica. Richiede certificazione energetica ex-ante ed ex-post da un soggetto abilitato."
  },
  {
    id: 'garanzia-pubblica',
    topic: 'Fondo di Garanzia PMI',
    keywords: ['fondo garanzia', 'mediocredito', 'garanzia pmi', 'accesso credito', 'fondo centrale garanzia', 'fondo di garanzia'],
    answer:
      "Il Fondo di Garanzia per le PMI (Mediocredito Centrale) facilita l'accesso al credito bancario coprendo il rischio di insolvenza fino all'80% del finanziamento. Non eroga direttamente denaro: garantisce il prestito bancario, riducendo la necessità di garanzie reali. L'impresa si rivolge alla banca, che chiede la garanzia al Fondo. Non è cumulabile automaticamente con tutti gli aiuti. Le condizioni variano per settore, dimensione e tipologia d'investimento."
  },
  {
    id: 'pnrr',
    topic: 'PNRR e fondi europei',
    keywords: ['pnrr', 'piano nazionale ripresa', 'fondi europei', 'fesr', 'fse', 'recovery fund', 'ngeu'],
    answer:
      "Il PNRR finanzia misure in sei aree: digitalizzazione, transizione ecologica, infrastrutture, istruzione, salute, inclusione. Le opportunità per le imprese arrivano tramite bandi specifici dei Ministeri o Regioni. I fondi europei strutturali (FESR, FSE+) sono gestiti a livello regionale attraverso i Programmi Regionali (PR 2021-2027). La differenza pratica: fondi PNRR hanno scadenze rigide al 2026, fondi strutturali regionali sono più flessibili. Per sapere quali misure sono attive nel tuo territorio, indicami regione e obiettivo."
  },

  // ─── MISURE E STRUMENTI AGGIUNTIVI ──────────────────────────────────────────
  {
    id: 'contratto-sviluppo',
    topic: 'Contratto di Sviluppo',
    keywords: ['contratto di sviluppo', 'contrato di sviluppo', 'grandi investimenti', 'invitalia programmi complessi'],
    answer:
      "Il Contratto di Sviluppo (Invitalia) è rivolto a programmi di investimento produttivo IMPORTANTI: investimento minimo 20 milioni di euro (3 milioni per le PMI del Mezzogiorno). Supporta produzione industriale, tutela ambientale, R&S e investimenti alberghieri con mix di fondo perduto e finanziamento agevolato. I tempi di istruttoria sono lunghi (12-24 mesi). Non è adatto a piccoli investimenti."
  },
  {
    id: 'zes',
    topic: 'Zone Economiche Speciali (ZES)',
    keywords: ['zes', 'zona economica speciale', 'zes unica', 'mezzogiorno zes', 'incentivi fiscali sud', 'credito imposta investimenti sud'],
    answer:
      "Le ZES (Zone Economiche Speciali) offrono semplificazioni burocratiche e agevolazioni fiscali per chi investe nel Mezzogiorno. Dal 2024 è attiva la 'ZES Unica' che copre tutte le regioni del Sud. Il credito d'imposta ZES per investimenti in beni strumentali può arrivare al 50% per le micro/piccole imprese. Non è sovrapponibile automaticamente con altri crediti d'imposta sullo stesso bene. Va verificata la modulistica annuale del decreto attuativo."
  },
  {
    id: 'simest',
    topic: 'SIMEST - Internazionalizzazione',
    keywords: ['simest', 'fondo 394', 'internazionalizzazione simest', 'fiere estere', 'e-commerce estero'],
    answer:
      "SIMEST gestisce il Fondo 394 per l'internazionalizzazione delle PMI italiane. Eroga finanziamenti agevolati per partecipazione a fiere estere, sviluppo di e-commerce internazionale, inserimento in mercati esteri, certificazioni internazionali. Una quota (fino al 25%) è a fondo perduto se l'impresa ha determinati requisiti. I bandi aprono per finestre trimestrali sul portale SIMEST. L'impresa deve avere sede in Italia e fatturato minimo di solito 100k€."
  },
  {
    id: 'startup-innovative',
    topic: 'Agevolazioni Startup Innovative',
    keywords: ['startup innovativa', 'registro startup', 'legge 221', 'iscrizione startup', 'detrazioni investitori startup'],
    answer:
      "Le startup innovative iscritte nell'apposita sezione del Registro Imprese (L. 221/2012) accedono a vantaggi specifici: esonero da alcuni diritti camerali, proroga automatica di perdita, accesso preferenziale a Smart&Start, contratti a termine semplificati, detrazione per investitori (30-50% dell'investimento). Requisiti: costituita da meno di 5 anni, valore produzione < 5 milioni, non quotata, almeno un requisito di innovazione (spese R&S, personale qualificato, brevetti). La qualifica dura 5 anni."
  },
  {
    id: 'credito-imposta-rs',
    topic: "Credito d'imposta Ricerca e Sviluppo",
    keywords: ["credito d'imposta ricerca", 'r&s', 'ricerca sviluppo', 'innovazione tecnologica', 'credito ricerca'],
    answer:
      "Il credito d'imposta per R&S, Innovazione e Design (L. 160/2019 e successivi) ha tre intensità diverse: R&S fondamentale (aliquota più alta), Innovazione tecnologica e design (aliquota media), Innovazione green/digitale (aliquota intermedia). Non è liquidità immediata: si usa in compensazione F24. Richiede relazione tecnica asseverata da soggetto qualificato. Attenzione: l'Agenzia Entrate ha intensificato i controlli — serve documentazione tecnica solida prima di usufruirne."
  },
  {
    id: 'agevolazioni-assunzioni',
    topic: 'Agevolazioni per assunzioni',
    keywords: ['assunzione', 'decontribuzione', 'bonus assunzioni', 'assunzione giovani', 'assunzione donne', 'incentivi occupazione'],
    answer:
      "Esistono diverse misure di decontribuzione per le assunzioni: esonero per under 30 NEET (programma GOL), sgravio per assunzione donne svantaggiate, decontribuzione per assunzioni nel Mezzogiorno, incentivi per stabilizzazione apprendisti. Queste agevolazioni non richiedono candidatura formale: si attivano con la comunicazione all'INPS al momento dell'assunzione. Gli importi e le percentuali cambiano ogni anno con la Legge di Bilancio, vanno sempre verificati al momento dell'assunzione."
  },
  {
    id: 'por-regionali',
    topic: 'Programmi Operativi Regionali (POR/PR)',
    keywords: ['por', 'fondi regionali', 'programma regionale', 'bando regione', 'fesr regionale', 'fse regionale'],
    answer:
      "I Programmi Regionali (ex POR) sono lo strumento con cui ogni Regione distribuisce i fondi europei FESR e FSE+ ai propri territori. Ogni Regione ha il suo catalogo di bandi aperti, con propri criteri e scadenze. È normale che lo stesso tipo di investimento sia agevolato in modo diverso tra Lombardia e Calabria. Per trovare i bandi regionali attivi, bisogna monitorare il sito istituzionale della propria Regione o le Camere di Commercio territoriali."
  },
  {
    id: 'piano-export-sud',
    topic: 'Piano Export Sud',
    keywords: ['piano export sud', 'export mezzogiorno', 'internazionalizzazione sud', 'voucher export sud'],
    answer:
      "Il Piano Export Sud è una misura specificamente per le imprese del Mezzogiorno che vogliono sviluppare la propria presenza sui mercati internazionali. Prevede servizi di internazionalizzazione, accompagnamento consulenziale e voucher per partecipazione a fiere ed eventi esteri. La gestione è di solito affidata a strutture regionali o alle Camere di Commercio."
  },
  {
    id: 'borse-lavoro-europee',
    topic: 'Tirocini e borse di studio finanziati',
    keywords: ['tirocinio finanziato', 'borsa lavoro', 'erasmus impresa', 'apprendistato finanziato', 'formazione on the job'],
    answer:
      "Esistono misure che finanziano il costo dei tirocini e apprendistati: programmi regionali spesso coprono l'indennità di tirocinio per il beneficiario. Erasmus+ per la formazione professionale finanzia tirocini all'estero. Le imprese che stipulano contratti di apprendistato professionalizzante possono beneficiare di aliquote INPS ridotte (11,61% vs aliquota piena). I costi di tutoraggio aziendale possono rientrare in misure formazione finanziate."
  },
  {
    id: 'fondo-crescita-sostenibile',
    topic: 'Fondo per la Crescita Sostenibile (FCS)',
    keywords: ['fondo crescita sostenibile', 'fondo brevetti', 'ricerca industriale', 'sviluppo pre-competitivo'],
    answer:
      "Il Fondo per la Crescita Sostenibile (MIMIT) finanzia programmi di R&S industriale su aree tecnologiche prioritarie. Eroga agevolazioni a grandi imprese e PMI per ricerca industriale, sviluppo sperimentale e tutela della proprietà intellettuale (valorizzazione brevetti italiani all'estero). Ha finestre tematiche specifiche — non è sempre aperto — e priorità che cambiano nel tempo."
  },
  {
    id: 'credito-imposta-investimenti',
    topic: "Credito d'imposta investimenti Transizione 4.0",
    keywords: ["credito d'imposta investimenti", 'piano transizione 4.0', 'innovazione tecnologica credito', 'beni strumentali credito'],
    answer:
      "Il credito d'imposta per investimenti in beni strumentali (Transizione 4.0/5.0) consente alle imprese di ridurre le tasse dovute proporzionalmente agli investimenti in macchinari interconnessi, software, formazione 4.0. Non è liquidità immediata: si compensa in F24 in 3 anni. Richiede perizia asseverata per beni sopra certe soglie e dichiarazione del fornitore sulla interconnessione. Le aliquote variano per anno e tipologia di bene."
  },

  // ─── SETTORI SPECIFICI ───────────────────────────────────────────────────────
  {
    id: 'agricoltura-psr',
    topic: "Agevolazioni settore agricolo (PSR/CSR)",
    keywords: ['psr', 'csr', 'piano sviluppo rurale', 'agricoltura bandi', 'agevolazioni agricoltura', 'feasr', 'giovane agricoltore'],
    answer:
      "L'agricoltura ha un sistema di agevolazioni separato dai bandi per le imprese commerciali. I fondi europei per l'agricoltura si chiamano FEASR e vengono distribuiti attraverso i Piani di Sviluppo Rurale Regionali (PSR, ora CSR). Misure tipiche: premio insediamento giovani agricoltori, agevolazioni per investimenti aziendali, misure agro-ambientali, filiere agroalimentari. Gestite dalle Regioni tramite i propri organismi pagatori (AGEA / OPR). Richiedono iscrizione al registro imprese agricole o possesso di partita IVA agricola."
  },
  {
    id: 'turismo',
    topic: "Agevolazioni settore turismo e ricettività",
    keywords: ['turismo', 'albergo', 'b&b', 'struttura ricettiva', 'hotel bandi', 'agevolazioni turismo'],
    answer:
      "Il turismo accede sia a misure generali (Nuova Sabatini per beni strumentali, Fondo Garanzia) sia a misure specifiche: Turismo 4.0 (digitalizzazione strutture ricettive), Contratto di Sviluppo per turismo (investimento min. 3 milioni nel Mezzogiorno per strutture alberghiere), bandi regionali per la qualificazione ricettiva. Le strutture B&B private non imprenditoriali hanno accesso molto limitato rispetto alle imprese ricettive regolarmente registrate."
  },
  {
    id: 'commercio',
    topic: "Agevolazioni commercio e retail",
    keywords: ['negozio', 'commercio', 'retail', 'apertura negozio', 'agevolazioni commercio', 'attività commerciale'],
    answer:
      "Il commercio al dettaglio accede principalmente a misure nazionali come Nuova Sabatini (per beni strumentali), Autoimpiego Centro-Nord e Resto al Sud 2.0 (per avvio nuove attività), Voucher Digitalizzazione e alcuni bandi camerali specifici. Attenzione: alcuni bandi escludono il settore del commercio puro (ATECO 47.x) o lo ammettono solo per attività legate alla produzione."
  },
  {
    id: 'artigianato',
    topic: "Agevolazioni artigianato",
    keywords: ['artigiano', 'artigianato', 'impresa artigiana', 'laboratorio artigiano'],
    answer:
      "Le imprese artigiane iscritte all'Albo Provinciale Artigiani (APA) accedono a misure specifiche: finanziamenti agevolati tramite le Leggi Regionali artigianato (spesso tramite Artigiancassa o analoghi), bandi regionali riservati, microprestiti per artigiani, agevolazioni delle Camere di Commercio. Avendo la doppia natura (Registro Imprese + Albo Artigiani), possono spesso cumulare agevolazioni da canali diversi."
  },
  {
    id: 'professioni',
    topic: "Agevolazioni liberi professionisti",
    keywords: ['libero professionista', 'partita iva professionista', 'avvocato bandi', 'ingegnere bandi', 'ordine professionale'],
    answer:
      "I liberi professionisti con Partita IVA — inclusi quelli iscritti a ordini professionali — possono accedere a molte misure se iscritti al Registro Imprese della Camera di Commercio. Alcuni profili professionali (architetti, ingegneri, consulenti) rientrano nei Voucher Internazionalizzazione, Fondo Nuove Competenze, bandi regionali per servizi avanzati. Resto al Sud 2.0 e Autoimpiego Centro-Nord includono esplicitamente i liberi professionisti. Va sempre verificato se il singolo bando li ammette."
  },
  {
    id: 'terzo-settore',
    topic: "Terzo settore e impresa sociale",
    keywords: ['cooperativa', 'onlus', 'terzo settore', 'aps', 'ets', 'impresa sociale', 'associazione'],
    answer:
      "Il terzo settore (ETS, cooperative, imprese sociali, APS, ODV) accede a un sistema di agevolazioni in parte distinto dalle imprese profit: fondi del Terzo Settore gestiti dal Ministero del Lavoro, bandi Foundation, misure FSE+ per servizi sociali, programmi europei come EaSI. Alcune misure generali (Fondo Garanzia, Nuova Sabatini) sono accessibili anche a cooperative. La distinzione tra ente non commerciale e impresa sociale influisce sui requisiti."
  },
  {
    id: 'startup-innovativa-requisiti',
    topic: "Startup vs PMI Innovativa - differenze",
    keywords: ['startup vs pmi', 'pmi innovativa', 'differenza startup pmi', 'crescita startup'],
    answer:
      "La startup innovativa (nei 5 anni dalla costituzione) e la PMI innovativa (nessun limite di età ma deve soddisfare criteri innovazione) hanno agevolazioni diverse. La startup accede a Smart&Start e agevolazioni fiscali per investitori. La PMI innovativa non ha accesso a Smart&Start ma mantiene esonero diritti camerali, accesso a strumenti di equity e alcune misure FESR riservate. Dopo i 5 anni la startup perde la qualifica — può trasformarsi in PMI innovativa se ne ha i requisiti."
  },

  // ─── STRATEGIE E CASI D'USO ──────────────────────────────────────────────────
  {
    id: 'startup-strategy',
    topic: 'Strategia Startup (impresa non ancora costituita)',
    keywords: ['non ho azienda', 'senza azienda', 'come ricevere fondi', 'aprire per fondi', 'creare societa'],
    answer:
      "Se non hai ancora un'azienda, molti bandi (Resto al Sud 2.0, ON Tasso Zero, Smart&Start) ti permettono di candidarti come 'persona fisica' con l'impegno di costituire la società solo DOPO l'approvazione del finanziamento. Questa strategia ti evita di costituire la società (e sostenerne i costi) senza la certezza del finanziamento. La forma giuridica da scegliere dipende dai requisiti del bando e dalle tue esigenze fiscali."
  },
  {
    id: 'cumulo-misure',
    topic: 'Combinabilità e cumulo tra misure',
    keywords: ['cumulo', 'combinare misure', 'due bandi insieme', 'cumulabile', 'sovrapposto', 'insieme'],
    answer:
      "Il cumulo tra misure è possibile ma regolato da limiti precisi. Regola generale: non si può superare l'intensità massima di aiuto (es. 45% per PMI in alcune categorie). De minimis si cumula con altri aiuti fino alla soglia de minimis, ma l'intensità complessiva non può superare i tetti GBER. Misure sullo stesso bene/spesa: devi verificare che il disciplinare non escluda esplicitamente il cumulo. Alcune misure sono incompatibili (es. non puoi prendere credito d'imposta Transizione 4.0 e Nuova Sabatini sullo stesso bene simultaneamente)."
  },
  {
    id: 'resto-sud-partnership',
    topic: 'Partnership Resto al Sud 2.0 (over 35)',
    keywords: ['socio under 35', 'oltre 35 anni', 'over 35 resto al sud', 'societa con giovane', 'maggioranza quote'],
    answer:
      "Per gli over 35 l'accesso a Resto al Sud 2.0 è subordinato alla creazione di una compagine societaria in cui i soci under 35 (disoccupati) detengano almeno il 51% delle quote societarie. Non è possibile accedere come ditta individuale o libero professionista singolo se si hanno più di 35 anni, a meno di non rientrare in specifici programmi di svantaggio molto restrittivi previsti dal bando attuativo."
  },
  {
    id: 'professionista-vs-ditta',
    topic: 'Libero Professionista vs Ditta Individuale',
    keywords: ['professionista', 'ditta individuale', 'partita iva', 'iscritti ordini', 'differenza forma giuridica'],
    answer:
      "Molti bandi regionali e voucher (es. Fiere, Digitalizzazione) ora equiparano i Liberi Professionisti alle PMI. Tuttavia, alcuni bandi sono riservati solo a chi è iscritto al Registro Imprese della Camera di Commercio. I professionisti iscritti a un albo (avvocati, architetti, ingegneri) di solito non risultano al Registro Imprese e alcune misure li escludono. La forma giuridica ideale dipende da quale misura vogliamo cogliere — è spesso conveniente aprire una SRL o una ditta individuale parallela."
  },
  {
    id: 'debiti',
    topic: 'Consolidamento Debiti',
    keywords: ['debiti', 'consolidamento debiti', 'pagare debiti', 'pagare tasse', 'coprire rosso', 'scoperto', 'esposizione bancaria'],
    answer:
      "Nessun bando pubblico a fondo perduto finanzia mai il pagamento di debiti pregressi, il rifinanziamento di esposizioni bancarie, o il pagamento di tasse e sanzioni. I fondi pubblici servono solo per nuovi investimenti di sviluppo o per nuova liquidità legata alla crescita, non per risanare passivi esistenti. Se l'impresa ha difficoltà finanziarie, gli strumenti da considerare sono diversi: accordo di ristrutturazione, strumenti della crisi d'impresa, non i bandi per agevolazioni."
  },
  {
    id: 'quote-soci',
    topic: 'Acquisto Quote Societarie',
    keywords: ['comprare quote', 'rilevare quote', 'liquidare un socio', 'uscita socio', 'acquisto societa', 'rilevare azienda'],
    answer:
      "L'acquisto di quote societarie (M&A) o la liquidazione di un socio uscente NON sono operazioni finanziabili con contributi a fondo perduto o finanziamenti agevolati standard. I bandi supportano l'acquisto di beni strumentali, assunzioni, o servizi reali — raramente i passaggi di proprietà aziendale puri. Esistono tuttavia strumenti di private equity e fondi SBIC/BEI per operazioni di M&A su PMI innovative."
  },
  {
    id: 'auto-privata',
    topic: 'Acquisto Auto Privata',
    keywords: ['macchina nuova', 'auto per me', 'comprare macchina', 'veicolo privato', 'uso personale'],
    answer:
      "I bandi di finanza agevolata finanziano solo veicoli AZIENDALI ad uso esclusivo dell'attività (furgoni, autocarri, veicoli speciali o auto immatricolate come autocarri). L'acquisto di un'auto per uso privato o personale NON è mai finanziabile. Per i veicoli aziendali, la principale misura disponibile è il Fondo Garanzia PMI tramite finanziamento bancario. Incentivi auto elettriche (Ecobonus) sono invece accessibili anche ai privati, ma non rientrano nella finanza agevolata per imprese."
  },
  {
    id: 'affitto-turistico',
    topic: 'Affitto Turistico Privato',
    keywords: ['casa vacanze', 'airbnb', 'affittacamere privato', 'rendita', 'affitti brevi'],
    answer:
      "Per ricevere contributi nel settore turistico, è necessario operare come Impresa (Società, Ditta Individuale) o struttura regolarmente iscritta ai registri regionali. Gli affitti brevi gestiti da privati in forma non imprenditoriale (con o senza Airbnb) sono generalmente esclusi dai bandi. La distinzione chiave è tra locazione turistica non imprenditoriale (esclusa) e impresa ricettiva (ammessa)."
  },
  {
    id: 'tasse-sanzioni',
    topic: 'Tasse e Sanzioni',
    keywords: ['pagare tasse', 'cartelle esattoriali', 'multe', 'sanzioni', 'iva', 'debiti fiscali'],
    answer:
      "Nessun bando pubblico può finanziare il pagamento di tasse, imposte, IVA (se detraibile), o sanzioni amministrative. I fondi pubblici sono destinati esclusivamente a nuovi progetti di sviluppo. Anzi, la presenza di cartelle esattoriali non regolarizzate o DURC irregolare è spesso causa di esclusione automatica dalla candidatura. Prima di candidarsi, va sempre verificata la regolarità fiscale e contributiva."
  },

  // ─── ASPETTI TECNICI E NORMATIVI ────────────────────────────────────────────
  {
    id: 'gber-esenzione',
    topic: 'Esenzione per categoria (GBER)',
    keywords: ['gber', 'esenzione categoria', 'aiuti esentati', 'regolamento europeo', 'aiuti senza notifica'],
    answer:
      "Il GBER (General Block Exemption Regulation) è il regolamento UE che elenca le categorie di aiuti di Stato che non richiedono notifica preventiva alla Commissione Europea. Nella pratica: la maggior parte dei bandi italiani rientra nel GBER, il che semplifica l'erogazione. Le intensità massime di aiuto (percentuali) dipendono dal regime: micro/piccole imprese hanno soglie più alte rispetto alle grandi imprese."
  },
  {
    id: 'durc-requisiti',
    topic: 'DURC e regolarità contributiva',
    keywords: ['durc', 'regolarità contributiva', 'inps irregolare', 'durc irregolare', 'requisiti generali'],
    answer:
      "Il DURC (Documento Unico di Regolarità Contributiva) certifica che l'impresa è in regola con i pagamenti INPS e INAIL. È richiesto da quasi tutti i bandi e spesso anche in sede di erogazione. Un DURC irregolare blocca la candidatura e l'erogazione. La regolarizzazione è possibile con rateizzazione INPS — ma va fatta prima dell'invio della domanda, non dopo. Va verificato anche il Casellario Giudiziario del legale rappresentante per alcune misure."
  },
  {
    id: 'antimafia',
    topic: 'Normativa Antimafia',
    keywords: ['antimafia', 'informativa antimafia', 'comunicazione antimafia', 'documentazione antimafia'],
    answer:
      "Per agevolazioni sopra certe soglie (di solito 150.000-200.000€), è richiesta l'informativa antimafia del legale rappresentante e delle persone fisiche con quote significative. Si ottiene tramite la Prefettura competente. I tempi di rilascio possono essere lunghi (30-60 giorni). Per importi inferiori basta di solito l'autocertificazione antimafia. Va gestita in anticipo nei piani di candidatura per grandi misure."
  },
  {
    id: 'spese-ante-domanda',
    topic: 'Spese ante domanda (retroattività)',
    keywords: ['spese già fatte', 'fatture già emesse', 'investimento già fatto', 'retroattivo', 'ante domanda'],
    answer:
      "I bandi pubblici finanziano quasi sempre spese FUTURE rispetto alla data di invio della domanda. Le spese già sostenute prima della domanda sono quasi sempre non ammissibili (principio di NON retroattività). Eccezione: alcuni bandi ammettono spese di progettazione/consulenza ante-domanda entro certi limiti percentuali. Fare investimenti prima di candidarsi è uno degli errori più costosi — vanno pianificati dopo la concessione del beneficio (o dopo la comunicazione di ricevibilità della domanda, secondo i bandi)."
  },
  {
    id: 'sal-erogazione',
    topic: 'SAL e modalità di erogazione del contributo',
    keywords: ['sal', 'stato avanzamento lavori', 'erogazione contributo', 'quando arrivano i soldi', 'rendicontazione'],
    answer:
      "Il contributo pubblico quasi mai arriva tutto in anticipo. La modalità più comune è l'erogazione per SAL (Stati Avanzamento Lavori): una parte all'avvio (se prevista), quote intermedie su rendicontazione parziale, saldo finale dopo completamento e collaudo. Questo significa che bisogna avere liquidità propria per sostenere l'investimento in anticipo, poi si viene rimborsati. Il pre-finanziamento bancario può essere utile per coprire il gap di cassa."
  },
  {
    id: 'intensita-aiuto',
    topic: 'Intensità di aiuto massima',
    keywords: ['intensità', 'percentuale massima', 'tetto contributo', 'massimale bando', 'quota pubblica'],
    answer:
      "L'intensità di aiuto è la percentuale massima di contributo pubblico rispetto all'investimento totale. Varia per: tipo di impresa (micro > PMI > grande), area geografica (Mezzogiorno e zone assistite hanno intensità più alte), tipo di investimento (R&S ha intensità più alte degli investimenti produttivi), regime europeo applicato (de minimis vs GBER). Superare l'intensità massima invalida l'agevolazione. In caso di cumulo tra più misure sulle stesse spese, l'intensità si cumula e non deve superare il massimo previsto dal regime."
  },

  // ─── DOMANDE FREQUENTI SPECIFICHE ───────────────────────────────────────────
  {
    id: 'fondo-perduto-vs-tasso-zero',
    topic: 'Fondo perduto vs tasso zero: quale scegliere',
    keywords: ['meglio fondo perduto', 'meglio tasso zero', 'confronto fondo perduto', 'quale conviene'],
    answer:
      "Dipende dalla situazione. Il fondo perduto è sempre preferibile per le spese correnti o di avvio senza restituzione. Il finanziamento a tasso zero è più utile per investimenti grandi dove il fondo perduto coprirebbe solo una parte e il resto serve liquidità: il tasso zero ti permette di accedere a capitali elevati che poi restituisci senza costi finanziari. Molte misure offrono MIX: quota fondo perduto (es. 30-50%) + finanziamento tasso zero sul resto."
  },
  {
    id: 'quanto-tempo-ottenere',
    topic: 'Tempi per ottenere il finanziamento',
    keywords: ['quanto ci vuole', 'tempi istruttoria', 'quando lo ottengo', 'attesa bando', 'durata iter'],
    answer:
      "I tempi variano enormemente per tipo di misura. Click day (sportello): la domanda è accolta subito ma l'erogazione può richiedere 6-18 mesi. Misure a graduatoria: istruttoria 3-6 mesi + tempi di erogazione. Crediti d'imposta (Transizione 4.0): si usano subito in compensazione fiscale dopo l'acquisto, ma la perizia deve essere pronta. Contratto di Sviluppo: 18-24 mesi di istruttoria. In generale, bisogna pianificare l'investimento sapendo che il rimborso arriverà mesi dopo aver sostenuto le spese."
  },
  {
    id: 'ateco-esclusi',
    topic: 'Settori ATECO esclusi dai bandi',
    keywords: ['ateco escluso', 'settore escluso', 'non ammissibile settore', 'codice ateco bandi', 'limitazioni settoriali'],
    answer:
      "Quasi tutti i bandi hanno un elenco di ATECO esclusi o limitati. I settori spesso esclusi sono: pesca e acquacoltura, produzione agricola primaria, siderurgia e carbone, produzioni correlate al tabacco, giochi d'azzardo, attività finanziarie pure. Ogni bando specifica i codici ATECO ammissibili: va verificato prima di qualsiasi candidatura. Alcune imprese con attività miste (più codici ATECO) possono accedere se il codice prevalente è ammissibile."
  },
  {
    id: 'size-impresa',
    topic: 'Dimensione impresa (micro/PMI/grande)',
    keywords: ['micro impresa', 'piccola impresa', 'media impresa', 'grande impresa', 'dimensione', 'classificazione'],
    answer:
      "La classificazione EU di dimensione impresa è basata su: numero dipendenti, fatturato annuo e totale di bilancio. Microimpresa: < 10 addetti, fatturato < 2M€. Piccola impresa: < 50 addetti, fatturato < 10M€. Media impresa: < 250 addetti, fatturato < 50M€. Grande impresa: oltre queste soglie. Per il calcolo vanno considerate anche le imprese collegate e associate (criterio dell'autonomia). Classificarsi correttamente è fondamentale perché determina le intensità di aiuto, i massimali e l'accesso a molte misure riservate alle PMI."
  },
  {
    id: 'stato-di-crisi',
    topic: 'Impresa in difficoltà e accesso ai bandi',
    keywords: ['impresa in difficoltà', 'perdite', 'situazione difficile', 'crisi aziendale', 'patrimonio negativo'],
    answer:
      "Le imprese in 'difficoltà' secondo la definizione UE (es. perdita di oltre il 50% del capitale, insolvenza) sono generalmente escluse dai bandi di finanza agevolata GBER. Questa verifica avviene tramite i bilanci. Alcune misure de minimis possono essere ancora accessibili. Se l'impresa attraversa una fase di perdita temporanea senza compromettere il capitale, l'accesso dipende dai singoli bandi. Prima di candidarsi con un bilancio in perdita, bisogna verificare la situazione patrimoniale con un commercialista."
  },
];
