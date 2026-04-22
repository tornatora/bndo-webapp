export type ExtractedData = {
  original_filename?: string;
  ragione_sociale?: string | null;
  sede_legale?: string | null;
  codice_fiscale?: string | null;
  partita_iva?: string | null;
  rea?: string | null;
  forma_giuridica?: string | null;
};

export type CustomField = {
  label: string;
  value: string;
};
