export type PiaAutomationJobStatus =
  | 'queued'
  | 'running'
  | 'waiting_user'
  | 'done'
  | 'failed'
  | 'stopped';

export type PiaAutomationJobPhase =
  | 'spid_wait'
  | 'bootstrap'
  | 'form_fill'
  | 'final_step_1'
  | 'format_download'
  | 'waiting_signature'
  | 'format_upload'
  | 'attachments'
  | 'ready_to_submit';

export type PiaAutomationJobProgress = {
  percent?: number;
  lastMessage?: string;
  stepsOk?: number;
  stepsFailed?: number;
  logs?: Array<{ ts: string; level: 'info' | 'warn' | 'error'; msg: string }>;
  meta?: Record<string, unknown>;
};

export type PiaAutomationJobRow = {
  id: string;
  application_id: string;
  created_by: string;
  browserbase_session_id: string | null;
  status: PiaAutomationJobStatus;
  phase: PiaAutomationJobPhase;
  cursor: number;
  progress: PiaAutomationJobProgress;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type PiaAutomationUserProfile = {
  firstName: string;
  lastName: string;
  taxCode?: string;
  vatNumber?: string;
  vatOpenDate?: string; // yyyy-MM-dd or dd/MM/yyyy
  email?: string;
  pec?: string;
  phone?: string;
  birthDate?: string; // yyyy-MM-dd
  birthPlace?: string;
  sex?: 'Maschio' | 'Femmina' | string;
  address?: {
    country?: string;
    region?: string;
    province?: string;
    city?: string;
    street?: string;
    civic?: string;
    zip?: string;
  };
  tipoImpresa?: string;
};

export type PiaAutomationProject = {
  title?: string;
  description?: string;
  ateco?: string;
  requestedContribution?: number;
  iban?: string;
  expenses?: Array<{ categoryLabel?: string; description: string; amount: number; iva?: number }>;
};

export type PiaAutomationDocumentSlot = {
  requirementKey: string;
  fileName: string;
  mimeType: string;
  buffer: Uint8Array;
};

export type PiaAutomationInputs = {
  user: PiaAutomationUserProfile;
  project: PiaAutomationProject;
  documents: Record<string, PiaAutomationDocumentSlot | undefined>;
  // Signed format (p7m) once available (resume phase)
  signedFormat?: PiaAutomationDocumentSlot | null;
};
