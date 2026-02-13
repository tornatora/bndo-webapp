export type RequiredDocKey =
  | 'formato_domanda'
  | 'descrizione_iniziativa'
  | 'piano_impresa'
  | 'documento_riconoscimento'
  | 'codice_fiscale'
  | 'dsan_requisiti_iniziativa'
  | 'dsan_requisiti_soggettivi'
  | 'dsan_antiriciclaggio'
  | 'dsan_casellario_procedure'
  | 'dsan_premialita_minoranze_pf'
  | 'dsan_premialita_minoranze_pg'
  | 'atto_costitutivo_statuto'
  | 'certificato_partita_iva'
  | 'dsan_compagine_cooperativa'
  | 'attestato_enm'
  | 'estratto_conto_vincolato'
  | 'permesso_soggiorno';

export type RequiredDoc = {
  key: RequiredDocKey;
  label: string;
  keywords: string[];
};

export const REQUIRED_DOCS_PIA_BASE: RequiredDoc[] = [
  {
    key: 'formato_domanda',
    label: 'Formato di domanda (generato dalla piattaforma, firmato digitalmente)',
    keywords: ['formato di domanda', 'domanda', 'formato domanda']
  },
  {
    key: 'documento_riconoscimento',
    label: 'Documento di riconoscimento',
    keywords: ['documento di riconoscimento', 'documento riconoscimento', 'carta identita', 'passaporto']
  },
  {
    key: 'codice_fiscale',
    label: 'Codice fiscale / Tessera sanitaria',
    keywords: ['codice fiscale', 'tessera sanitaria', 'cf']
  },
  {
    key: 'dsan_requisiti_iniziativa',
    label: 'DSAN possesso requisiti iniziativa economica',
    keywords: ['dsan', 'requisiti', 'iniziativa economica']
  },
  {
    key: 'dsan_requisiti_soggettivi',
    label: 'DSAN possesso requisiti soggettivi',
    keywords: ['dsan', 'requisiti soggettivi']
  },
  {
    key: 'dsan_antiriciclaggio',
    label: 'DSAN antiriciclaggio',
    keywords: ['dsan', 'antiriciclaggio']
  },
  {
    key: 'dsan_casellario_procedure',
    label: 'DSAN casellario e procedure concorsuali liquidatorie',
    keywords: ['dsan', 'casellario', 'procedure concorsuali', 'liquidatorie']
  },
  {
    key: 'dsan_premialita_minoranze_pf',
    label: 'DSAN premialita soci di minoranza (persona fisica, se presenti)',
    keywords: ['dsan', 'premialita', 'minoranza', 'persona fisica']
  },
  {
    key: 'dsan_premialita_minoranze_pg',
    label: 'DSAN premialita soci di minoranza (persona giuridica, se presenti)',
    keywords: ['dsan', 'premialita', 'minoranza', 'persona giuridica']
  },
  {
    key: 'atto_costitutivo_statuto',
    label: 'Atto costitutivo ed eventuale statuto',
    keywords: ['atto costitutivo', 'statuto']
  },
  {
    key: 'certificato_partita_iva',
    label: 'Certificato di attribuzione Partita IVA',
    keywords: ['certificato', 'attribuzione', 'partita iva', 'p iva']
  },
  {
    key: 'dsan_compagine_cooperativa',
    label: 'DSAN compagine societa cooperativa',
    keywords: ['dsan', 'compagine', 'cooperativa']
  },
  {
    key: 'attestato_enm',
    label: 'Attestato corso ENM (facoltativo)',
    keywords: ['attestato', 'enm']
  },
  {
    key: 'estratto_conto_vincolato',
    label: 'Estratto conto corrente vincolato/dedicato (facoltativo)',
    keywords: ['estratto conto', 'vincolato', 'dedicato', 'conto corrente']
  },
  {
    key: 'permesso_soggiorno',
    label: 'Permesso di soggiorno (se in possesso)',
    keywords: ['permesso', 'soggiorno']
  }
];

export const REQUIRED_DOCS_PIA_VOUCHER: RequiredDoc[] = [
  { key: 'descrizione_iniziativa', label: 'Descrizione iniziativa economica (firmata digitalmente)', keywords: ['descrizione', 'iniziativa'] },
  ...REQUIRED_DOCS_PIA_BASE
];

export const REQUIRED_DOCS_PIA_INVESTIMENTO: RequiredDoc[] = [
  { key: 'piano_impresa', label: 'Piano di impresa (firmato digitalmente)', keywords: ['piano', 'impresa'] },
  ...REQUIRED_DOCS_PIA_BASE
];

export type DocumentLike = {
  application_id: string;
  file_name: string;
};

function normalize(text: string) {
  return text.toLowerCase().replace(/[_\-]/g, ' ');
}

export function getRequiredDocsForPractice(practiceKeyOrTenderId: string): RequiredDoc[] {
  const key = practiceKeyOrTenderId.toLowerCase();
  // Temporary mapping: we currently run only 2 practices in-prod.
  // Autoimpiego -> Voucher, Resto al Sud -> Contributo programmi investimento.
  if (key === 'autoimpiego_centro_nord' || key.includes('autoimpiego')) return REQUIRED_DOCS_PIA_VOUCHER;
  if (key === 'resto_sud_2_0' || key.includes('resto')) return REQUIRED_DOCS_PIA_INVESTIMENTO;
  // Fallback.
  return REQUIRED_DOCS_PIA_BASE;
}

export function computeDocumentChecklist(applicationId: string, practiceKeyOrTenderId: string, docs: DocumentLike[]) {
  const inApp = docs.filter((d) => d.application_id === applicationId);
  const haystack = inApp.map((d) => normalize(d.file_name)).join(' | ');

  const requirements = getRequiredDocsForPractice(practiceKeyOrTenderId);

  return requirements.map((req) => {
    const uploaded = req.keywords.some((kw) => haystack.includes(normalize(kw)));
    return { ...req, uploaded };
  });
}

export function computeMissingDocsForApplication(applicationId: string, docs: DocumentLike[]) {
  const checklist = computeDocumentChecklist(applicationId, 'base', docs);
  return checklist.filter((item) => !item.uploaded);
}
