export type ExtractedData = {
  original_filename?: string;
  ragione_sociale: string;
  sede_legale: string;
  codice_fiscale: string;
  partita_iva: string;
  rea: string;
  forma_giuridica: string;
  nome_legale_rappresentante: string;
  email_pec: string;
  telefono: string;
};

export type CustomField = {
  key: string;
  value: string;
};

export type UploadedFile = {
  name: string;
  size: number;
  type: string;
  file?: File;
};

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type StepStatus = 'completed' | 'active' | 'upcoming';

export type WizardDirection = 'next' | 'back';

export type SpidPhase = 'login' | 'authenticating' | 'authenticated' | 'auto-filling' | 'uploading-docs' | 'submitting' | 'done';

export type WizardState = {
  currentStep: WizardStep;
  direction: WizardDirection;
  useAiAgent: boolean;
  files: {
    visura: UploadedFile | null;
    cartaIdentita: UploadedFile | null;
    altri: UploadedFile[];
  };
  extracted: ExtractedData;
  customFields: CustomField[];
  generatedPdfBlob: Blob | null;
  generatedDocxBlob: Blob | null;
  spidPhase: SpidPhase;
  spidAuthenticated: boolean;
};
