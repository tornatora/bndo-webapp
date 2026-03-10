/**
 * Bandi regionali e camerali curati — non presenti su Incentivi.gov
 * Formato identico a IncentiviDoc per integrazione trasparente.
 * Focus: regioni più richieste (Sicilia, Calabria, Campania, Puglia, Lombardia, Lazio, Sardegna).
 */
import type { IncentiviDoc } from '@/lib/matching/types';

export const REGIONAL_GRANTS: IncentiviDoc[] = [
  // ── SICILIA ──────────────────────────────────────────────────
  {
    id: 'regional-sicilia-po-fesr-digitalizzazione',
    title: 'PO FESR Sicilia 2021-2027 — Digitalizzazione PMI',
    description:
      'Contributi a fondo perduto per la digitalizzazione delle micro, piccole e medie imprese siciliane. Acquisto di hardware, software, servizi cloud, cybersecurity, e-commerce, CRM, marketing digitale. Intensità agevolativa fino al 60%. Rivolto a imprese già attive con sede operativa in Sicilia.',
    authorityName: 'Regione Siciliana — Assessorato alle Attività Produttive',
    regions: ['Sicilia'],
    sectors: ['ICT', 'Digitale', 'Commercio', 'Manifattura', 'Servizi', 'Turismo', 'Artigianato'],
    beneficiaries: ['PMI', 'Micro Impresa', 'Piccola Impresa', 'Media Impresa'],
    purposes: ['Digitalizzazione', 'Innovazione', 'Acquisto beni strumentali'],
    supportForm: ['Contributo/Fondo perduto'],
    costMax: 150000,
    displayAmountLabel: 'Fino a € 90.000 (60%)',
    displayCoverageLabel: '50% - 60%',
    coverageMinPercent: 50,
    coverageMaxPercent: 60,
    institutionalLink: 'https://www.sicilia.regione.it/',
  },
  {
    id: 'regional-sicilia-turismo-ricettivo',
    title: 'Bando Turismo Sicilia — Miglioramento strutture ricettive',
    description:
      'Incentivi per la ristrutturazione e il miglioramento delle strutture ricettive siciliane: hotel, B&B, agriturismo, case vacanza. Interventi di efficientamento energetico, accessibilità, qualificazione offerta turistica. Contributo a fondo perduto fino al 50%.',
    authorityName: 'Regione Siciliana — Assessorato Turismo',
    regions: ['Sicilia'],
    sectors: ['Turismo', 'Alloggio', 'Ristorazione'],
    beneficiaries: ['PMI', 'Micro Impresa', 'Impresa individuale'],
    purposes: ['Turismo', 'Ristrutturazione', 'Efficientamento energetico', 'Acquisto beni strumentali'],
    supportForm: ['Contributo/Fondo perduto'],
    costMax: 200000,
    displayAmountLabel: 'Fino a € 100.000 (50%)',
    displayCoverageLabel: '30% - 50%',
    coverageMinPercent: 30,
    coverageMaxPercent: 50,
    institutionalLink: 'https://www.sicilia.regione.it/',
  },
  {
    id: 'regional-sicilia-macchinari-pmi',
    title: 'Sicilia — Bando Macchinari e Beni Strumentali PMI',
    description:
      'Acquisto di macchinari, impianti, attrezzature e beni strumentali da parte di PMI siciliane. Finalizzato al potenziamento della capacità produttiva, ammodernamento tecnologico e innovazione di processo. Contributo a fondo perduto fino al 45% + finanziamento agevolato.',
    authorityName: 'Regione Siciliana — Assessorato alle Attività Produttive',
    regions: ['Sicilia'],
    sectors: ['Manifattura', 'Artigianato', 'Industria', 'Agroalimentare', 'Commercio'],
    beneficiaries: ['PMI', 'Micro Impresa', 'Piccola Impresa', 'Media Impresa'],
    purposes: ['Acquisto macchinari', 'Innovazione di processo', 'Ammodernamento produttivo', 'Beni strumentali'],
    supportForm: ['Contributo/Fondo perduto', 'Finanziamento agevolato'],
    costMax: 500000,
    displayAmountLabel: 'Fino a 45% fondo perduto + finanziamento agevolato',
    displayCoverageLabel: '45% - 65%',
    coverageMinPercent: 45,
    coverageMaxPercent: 65,
    institutionalLink: 'https://www.sicilia.regione.it/',
  },

  // ── CALABRIA ─────────────────────────────────────────────────
  {
    id: 'regional-calabria-por-fesr-imprese',
    title: 'POR FESR Calabria 2021-2027 — Sostegno PMI',
    description:
      'Contributi a fondo perduto per investimenti produttivi delle PMI calabresi. Include acquisto macchinari, attrezzature, software, brevetti, ammodernamento dei processi produttivi. Intensità fino al 60% per le micro imprese.',
    authorityName: 'Regione Calabria — Dip. Attività Produttive',
    regions: ['Calabria'],
    sectors: ['Manifattura', 'Turismo', 'ICT', 'Artigianato', 'Agroalimentare', 'Servizi'],
    beneficiaries: ['PMI', 'Micro Impresa', 'Piccola Impresa', 'Media Impresa'],
    purposes: ['Investimenti produttivi', 'Acquisto macchinari', 'Innovazione', 'Digitalizzazione'],
    supportForm: ['Contributo/Fondo perduto'],
    costMax: 400000,
    displayAmountLabel: 'Fino al 60% fondo perduto',
    displayCoverageLabel: '40% - 60%',
    coverageMinPercent: 40,
    coverageMaxPercent: 60,
    institutionalLink: 'https://www.regione.calabria.it/',
  },
  {
    id: 'regional-calabria-voucher-digitali',
    title: 'Voucher Digitali I4.0 Calabria — Camera di Commercio',
    description:
      'Voucher per la digitalizzazione delle micro e piccole imprese calabresi. Spese ammissibili: servizi di consulenza digitale, acquisto software, cloud computing, cybersecurity, e-commerce, CRM, siti web, digital marketing. Voucher fino a € 10.000.',
    authorityName: 'Camera di Commercio Calabria',
    regions: ['Calabria'],
    sectors: ['ICT', 'Digitale', 'Commercio', 'Servizi', 'Turismo', 'Artigianato'],
    beneficiaries: ['Micro Impresa', 'Piccola Impresa'],
    purposes: ['Digitalizzazione', 'E-commerce', 'Marketing digitale', 'Industria 4.0'],
    supportForm: ['Voucher'],
    costMax: 20000,
    displayAmountLabel: 'Voucher fino a € 10.000 (50%)',
    displayCoverageLabel: '50%',
    coverageMinPercent: 50,
    coverageMaxPercent: 50,
    institutionalLink: 'https://www.calabria.camcom.it/',
  },

  // ── CAMPANIA ─────────────────────────────────────────────────
  {
    id: 'regional-campania-startup-innovative',
    title: 'Campania Startup — Incentivi per nuove imprese innovative',
    description:
      'Contributi per la creazione di startup innovative e spin-off in Campania. Copre spese di avvio, investimenti in R&D, proprietà intellettuale, assunzione di personale qualificato. Contributo a fondo perduto fino al 75% per giovani under 35.',
    authorityName: 'Regione Campania — Sviluppo Campania',
    regions: ['Campania'],
    sectors: ['ICT', 'Ricerca', 'Digitale', 'Biotecnologie', 'Green Economy', 'Innovazione'],
    beneficiaries: ['Startup', 'Nuova impresa', 'PMI innovativa', 'Spin-off'],
    purposes: ['Start up', 'Innovazione', 'R&D', 'Proprietà intellettuale'],
    supportForm: ['Contributo/Fondo perduto'],
    costMax: 250000,
    displayAmountLabel: 'Fino al 75% fondo perduto',
    displayCoverageLabel: '50% - 75%',
    coverageMinPercent: 50,
    coverageMaxPercent: 75,
    institutionalLink: 'https://www.sviluppocampania.it/',
  },

  // ── PUGLIA ───────────────────────────────────────────────────
  {
    id: 'regional-puglia-titolo-ii',
    title: 'Puglia — Titolo II — Investimenti produttivi',
    description:
      'Agevolazioni per investimenti produttivi delle PMI pugliesi. Acquisto di macchinari, impianti, attrezzature, opere murarie, software. Contributo in conto capitale fino al 30% + finanziamento agevolato. Per imprese esistenti e nuove attività.',
    authorityName: 'Regione Puglia — Puglia Sviluppo',
    regions: ['Puglia'],
    sectors: ['Manifattura', 'Turismo', 'Commercio', 'Servizi', 'Artigianato', 'Agroalimentare'],
    beneficiaries: ['PMI', 'Micro Impresa', 'Piccola Impresa', 'Media Impresa'],
    purposes: ['Investimenti produttivi', 'Acquisto macchinari', 'Ampliamento', 'Nuova unità produttiva'],
    supportForm: ['Contributo/Fondo perduto', 'Finanziamento agevolato'],
    costMax: 3000000,
    displayAmountLabel: 'Fondo perduto 30% + finanziamento agevolato',
    displayCoverageLabel: '30% - 65%',
    coverageMinPercent: 30,
    coverageMaxPercent: 65,
    institutionalLink: 'https://www.pugliasviluppo.eu/',
  },
  {
    id: 'regional-puglia-nidi',
    title: 'NIDI Puglia — Nuove Iniziative d\'Impresa',
    description:
      'Incentivi per l\'avvio di nuove attività imprenditoriali in Puglia. Rivolto a disoccupati, inoccupati, NEET, lavoratori in cassa integrazione. Finanziamento a tasso zero fino a € 150.000 con contributo a fondo perduto del 50%. Per nuove imprese con meno di 6 mesi di vita.',
    authorityName: 'Regione Puglia',
    regions: ['Puglia'],
    sectors: ['Turismo', 'Commercio', 'Servizi', 'ICT', 'Artigianato', 'Manifattura', 'Ristorazione'],
    beneficiaries: ['Aspiranti imprenditori', 'Disoccupati', 'Inoccupati', 'NEET', 'Nuova impresa'],
    purposes: ['Start up/Sviluppo d impresa', 'Autoimpiego', 'Nuova impresa'],
    supportForm: ['Contributo/Fondo perduto', 'Finanziamento agevolato'],
    costMax: 150000,
    displayAmountLabel: '50% fondo perduto + 50% tasso zero',
    displayCoverageLabel: '100%',
    coverageMinPercent: 100,
    coverageMaxPercent: 100,
    institutionalLink: 'https://www.pugliasviluppo.eu/nidi',
  },

  // ── LOMBARDIA ────────────────────────────────────────────────
  {
    id: 'regional-lombardia-voucher-digitali-cciaa',
    title: 'Voucher Digitali I4.0 — Camera di Commercio Milano-Monza-Brianza-Lodi',
    description:
      'Voucher per la digitalizzazione delle MPMI. Spese ammissibili: consulenza digitale, acquisto software e hardware, cloud, cybersecurity, big data, blockchain, IoT, intelligenza artificiale, realtà aumentata. Voucher fino a € 10.000.',
    authorityName: 'Camera di Commercio Milano-Monza-Brianza-Lodi',
    regions: ['Lombardia'],
    sectors: ['ICT', 'Digitale', 'Manifattura', 'Commercio', 'Servizi'],
    beneficiaries: ['Micro Impresa', 'Piccola Impresa', 'Media Impresa'],
    purposes: ['Digitalizzazione', 'Industria 4.0', 'Innovazione tecnologica'],
    supportForm: ['Voucher'],
    costMax: 20000,
    displayAmountLabel: 'Voucher fino a € 10.000 (50%)',
    displayCoverageLabel: '50%',
    coverageMinPercent: 50,
    coverageMaxPercent: 50,
    institutionalLink: 'https://www.milomb.camcom.it/',
  },
  {
    id: 'regional-lombardia-internazionalizzazione',
    title: 'Lombardia — Bando Internazionalizzazione PMI',
    description:
      'Contributi per l\'internazionalizzazione delle PMI lombarde. Partecipazione a fiere internazionali, missioni commerciali, consulenze per export, certificazioni per mercati esteri, marketing internazionale, B2B matching. Contributo a fondo perduto fino al 50%.',
    authorityName: 'Regione Lombardia — Unioncamere Lombardia',
    regions: ['Lombardia'],
    sectors: ['Manifattura', 'Agroalimentare', 'Moda', 'Design', 'Meccanica', 'ICT'],
    beneficiaries: ['PMI', 'Micro Impresa', 'Piccola Impresa', 'Media Impresa'],
    purposes: ['Internazionalizzazione', 'Export', 'Fiere internazionali', 'Marketing estero'],
    supportForm: ['Contributo/Fondo perduto'],
    costMax: 50000,
    displayAmountLabel: 'Fino a € 25.000 (50%)',
    displayCoverageLabel: '50%',
    coverageMinPercent: 50,
    coverageMaxPercent: 50,
    institutionalLink: 'https://www.regione.lombardia.it/',
  },

  // ── LAZIO ────────────────────────────────────────────────────
  {
    id: 'regional-lazio-startup-fondo-perduto',
    title: 'Lazio — Fondo Futuro — Microcredito per nuove imprese',
    description:
      'Finanziamenti a tasso agevolato per l\'avvio e lo sviluppo di nuove micro e piccole imprese nel Lazio. Include prestiti fino a € 25.000 per le nuove imprese e fino a € 50.000 per le imprese esistenti. Nessuna garanzia reale richiesta.',
    authorityName: 'Regione Lazio — Lazio Innova',
    regions: ['Lazio'],
    sectors: ['Commercio', 'Servizi', 'Turismo', 'Artigianato', 'ICT', 'Ristorazione'],
    beneficiaries: ['Micro Impresa', 'Nuova impresa', 'Aspiranti imprenditori', 'Lavoratori autonomi'],
    purposes: ['Start up', 'Sviluppo impresa', 'Investimenti iniziali'],
    supportForm: ['Finanziamento agevolato'],
    costMax: 50000,
    displayAmountLabel: 'Finanziamento fino a € 50.000',
    displayCoverageLabel: 'Tasso agevolato',
    institutionalLink: 'https://www.lazioinnova.it/',
  },

  // ── SARDEGNA ─────────────────────────────────────────────────
  {
    id: 'regional-sardegna-turismo-imprese',
    title: 'Sardegna — Incentivi per imprese turistiche',
    description:
      'Contributi a fondo perduto per nuove imprese turistiche e ristrutturazione strutture ricettive in Sardegna. Hotel, B&B, agriturismi, campeggi, stabilimenti balneari. Finanziamento fino al 50% degli investimenti ammissibili.',
    authorityName: 'Regione Sardegna — Assessorato Turismo',
    regions: ['Sardegna'],
    sectors: ['Turismo', 'Alloggio', 'Ristorazione', 'Sport', 'Cultura'],
    beneficiaries: ['PMI', 'Micro Impresa', 'Nuova impresa'],
    purposes: ['Turismo', 'Nuova struttura ricettiva', 'Ristrutturazione', 'Qualificazione offerta'],
    supportForm: ['Contributo/Fondo perduto'],
    costMax: 300000,
    displayAmountLabel: 'Fino al 50% fondo perduto',
    displayCoverageLabel: '30% - 50%',
    coverageMinPercent: 30,
    coverageMaxPercent: 50,
    institutionalLink: 'https://www.regione.sardegna.it/',
  },

  // ── VENETO ───────────────────────────────────────────────────
  {
    id: 'regional-veneto-voucher-innovazione',
    title: 'Veneto — Voucher per l\'Innovazione',
    description:
      'Voucher per progetti di innovazione delle PMI venete. Consulenza per innovazione di prodotto/processo, design, prototipazione, brevetti, trasferimento tecnologico. Voucher fino a € 15.000.',
    authorityName: 'Regione Veneto — Veneto Innovazione',
    regions: ['Veneto'],
    sectors: ['Manifattura', 'ICT', 'Digitale', 'Design', 'Artigianato'],
    beneficiaries: ['PMI', 'Micro Impresa', 'Piccola Impresa'],
    purposes: ['Innovazione', 'R&D', 'Prototipazione', 'Brevetti'],
    supportForm: ['Voucher'],
    costMax: 30000,
    displayAmountLabel: 'Voucher fino a € 15.000 (50%)',
    displayCoverageLabel: '50%',
    coverageMinPercent: 50,
    coverageMaxPercent: 50,
    institutionalLink: 'https://www.regione.veneto.it/',
  },

  // ── EMILIA-ROMAGNA ───────────────────────────────────────────
  {
    id: 'regional-emilia-romagna-digitalizzazione',
    title: 'Emilia-Romagna — Contributi per digitalizzazione imprese',
    description:
      'Contributi per la transizione digitale delle imprese emiliano-romagnole. Progetti di digitalizzazione, automazione, cloud, IoT, big data, cyber security. Contributo fino al 50% a fondo perduto.',
    authorityName: 'Regione Emilia-Romagna — ART-ER',
    regions: ['Emilia-Romagna'],
    sectors: ['Manifattura', 'ICT', 'Meccanica', 'Agroalimentare', 'Moda', 'Servizi'],
    beneficiaries: ['PMI', 'Micro Impresa', 'Piccola Impresa', 'Media Impresa'],
    purposes: ['Digitalizzazione', 'Industria 4.0', 'Automazione', 'Innovazione tecnologica'],
    supportForm: ['Contributo/Fondo perduto'],
    costMax: 100000,
    displayAmountLabel: 'Fino a € 50.000 (50%)',
    displayCoverageLabel: '50%',
    coverageMinPercent: 50,
    coverageMaxPercent: 50,
    institutionalLink: 'https://www.art-er.it/',
  },

  // ── TOSCANA ──────────────────────────────────────────────────
  {
    id: 'regional-toscana-artigianato',
    title: 'Toscana — Bando Artigianato e manifattura',
    description:
      'Contributi per imprese artigiane e manifatturiere toscane. Investimenti in macchinari, attrezzature, innovazione di prodotto, efficientamento energetico. Contributo a fondo perduto fino al 40%. Priorità per imprese artigiane iscritte all\'Albo.',
    authorityName: 'Regione Toscana — Sviluppo Toscana',
    regions: ['Toscana'],
    sectors: ['Artigianato', 'Manifattura', 'Moda', 'Pelletteria', 'Oreficeria', 'Legno'],
    beneficiaries: ['Impresa artigiana', 'PMI', 'Micro Impresa'],
    purposes: ['Investimenti produttivi', 'Acquisto macchinari', 'Innovazione di prodotto'],
    supportForm: ['Contributo/Fondo perduto'],
    costMax: 200000,
    displayAmountLabel: 'Fino al 40% fondo perduto',
    displayCoverageLabel: '30% - 40%',
    coverageMinPercent: 30,
    coverageMaxPercent: 40,
    institutionalLink: 'https://www.regione.toscana.it/',
  },
];

export function getRegionalGrantsDocs(): IncentiviDoc[] {
  return REGIONAL_GRANTS;
}
