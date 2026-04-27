import type { ExtractedData } from './types';

export const DEFAULT_EXTRACTED: ExtractedData = {
  ragione_sociale: 'OFFICINE MECCANICHE SRL',
  sede_legale: 'Via Roma 42, 20121 Milano MI',
  codice_fiscale: 'RSSMRA80A01F205X',
  partita_iva: 'IT12345678901',
  rea: 'MI-1234567',
  forma_giuridica: "Società a Responsabilità Limitata",
  nome_legale_rappresentante: 'Mario Rossi',
  email_pec: 'officine.meccaniche@pec.it',
  telefono: '+39 02 1234567',
};

export const INITIAL_EXTRACTED: ExtractedData = {
  ragione_sociale: '',
  sede_legale: '',
  codice_fiscale: '',
  partita_iva: '',
  rea: '',
  forma_giuridica: '',
  nome_legale_rappresentante: '',
  email_pec: '',
  telefono: '',
};

export const EXTRACTION_STEPS = [
  'Analisi PDF Visura Camerale...',
  'Riconoscimento Ragione Sociale...',
  'Estrazione Codice Fiscale / P.IVA...',
  'Estrazione Sede Legale / REA...',
  'Analisi Carta d\'Identità...',
  'Verifica dati anagrafici...',
];

export const FORM_FIELDS = [
  { key: 'ragione_sociale' as const, label: 'Ragione Sociale', placeholder: 'Es. Officine Meccaniche SRL', section: 'impresa' },
  { key: 'sede_legale' as const, label: 'Sede Legale', placeholder: 'Es. Via Roma 42, 20121 Milano MI', section: 'impresa' },
  { key: 'codice_fiscale' as const, label: 'Codice Fiscale', placeholder: 'Es. RSSMRA80A01F205X', section: 'impresa' },
  { key: 'partita_iva' as const, label: 'Partita IVA', placeholder: 'Es. IT12345678901', section: 'impresa' },
  { key: 'rea' as const, label: 'REA', placeholder: 'Es. MI-1234567', section: 'impresa' },
  { key: 'forma_giuridica' as const, label: 'Forma Giuridica', placeholder: 'Es. Società a Responsabilità Limitata', section: 'impresa' },
  { key: 'nome_legale_rappresentante' as const, label: 'Legale Rappresentante', placeholder: 'Es. Mario Rossi', section: 'legale' },
  { key: 'email_pec' as const, label: 'Email PEC', placeholder: 'Es. azienda@pec.it', section: 'legale' },
  { key: 'telefono' as const, label: 'Telefono', placeholder: 'Es. +39 02 1234567', section: 'legale' },
];
