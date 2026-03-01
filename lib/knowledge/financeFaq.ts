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
    keywords: ['fondo perduto', 'agevolato', 'voucher', 'credito', 'imposta', 'differenza'],
    answer:
      "Fondo perduto: quota non restituita. Finanziamento agevolato: prestito a condizioni migliorative. Voucher: contributo mirato su spese specifiche. Credito d'imposta: beneficio in compensazione fiscale."
  },
  {
    id: 'de-minimis',
    topic: 'Regime de minimis',
    keywords: ['de minimis', 'aiuti', 'massimale', 'storico aiuti'],
    answer:
      "Il de minimis limita il totale aiuti ottenibili in un periodo pluriennale. Prima della candidatura va sempre verificato lo storico aiuti già ricevuti.",
    volatile: true
  },
  {
    id: 'sportello-vs-graduatoria',
    topic: 'Sportello vs graduatoria',
    keywords: ['sportello', 'graduatoria', 'tempistiche', 'apertura'],
    answer:
      "A sportello conta la rapidità e la completezza all'apertura. A graduatoria conta soprattutto il punteggio tecnico del progetto."
  },
  {
    id: 'ammissibili',
    topic: 'Spese ammissibili',
    keywords: ['spese', 'ammissibili', 'costi', 'investimenti'],
    answer:
      "Le spese ammissibili dipendono dal singolo bando; spesso includono beni strumentali, software/digitalizzazione, consulenze specialistiche e in alcuni casi opere, formazione o personale."
  },
  {
    id: 'documents',
    topic: 'Documenti tipici',
    keywords: ['documenti', 'visura', 'business plan', 'durc', 'preventivi'],
    answer:
      "I documenti più frequenti sono visura camerale aggiornata, preventivi coerenti, progetto/business plan, dichiarazioni aiuti, DURC e documentazione anagrafico-fiscale."
  },
  {
    id: 'resto-sud',
    topic: 'Resto al Sud',
    keywords: ['resto al sud', 'sud', 'invitalia'],
    answer:
      "Resto al Sud è una misura per avvio/sviluppo d'impresa nelle aree ammesse. La candidabilità dipende da territorio, profilo beneficiario e coerenza delle spese."
  },
  {
    id: 'autoimpiego',
    topic: 'Autoimpiego Centro Nord',
    keywords: ['autoimpiego', 'centro nord', 'avvio', 'nuova impresa'],
    answer:
      "Autoimpiego Centro Nord supporta l'avvio nelle regioni ammesse con requisiti specifici sul beneficiario e sul progetto; la verifica puntuale dei criteri è decisiva."
  }
];

