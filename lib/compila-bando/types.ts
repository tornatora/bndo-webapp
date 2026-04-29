export type FlowTarget = {
  css?: string;
  id?: string;
  name?: string;
  tag?: string;
  text?: string;
  xpath?: string;
  inputType?: string;
  label?: string;
  placeholder?: string;
  role?: string;
  testId?: string;
};

export type FlowStep = {
  type: 'goto' | 'click' | 'type' | 'select' | 'scroll' | string;
  url?: string;
  waitUntil?: string;
  target?: FlowTarget;
  valueFrom?: string;
  actionKind?: string;
  timing?: { preDelayMs?: number };
  direction?: 'up' | 'down' | string;
  amount?: number;
};

export type FlowTemplate = {
  name: string;
  bandoKey: string;
  steps: FlowStep[];
  fieldMapping: Record<string, string>;
  expectedDurationSeconds?: number;
  version?: number;
  source?: string;
  updatedAt?: string;
};

export type ClientData = {
  firstName: string;
  lastName: string;
  fullName: string;
  zip: string;
  province: string;
  city: string;
  pec: string;
  phone: string;
  ragioneSociale: string;
  codiceFiscale: string;
  partitaIva: string;
  rea: string;
  sedeLegale: string;
  formaGiuridica: string;
};

export type FlowStepExecutionResult = {
  stepIndex: number;
  stepType: string;
  actionKind?: string;
  selectorTried?: string;
  valueUsed?: string;
  urlUsed?: string;
  success: boolean;
  elapsedMs: number;
  message: string;
  error?: string;
};

export type FlowExecutionPhase =
  | 'form_fill'
  | 'post_sign_upload'
  | 'attachments'
  | 'final_submit'
  | string;

export type FlowExecutionResult = {
  ok: boolean;
  phase?: FlowExecutionPhase;
  applicationId?: string | null;
  sessionId?: string | null;
  requiresHumanAction?: boolean;
  elapsedMs: number;
  stepsExecuted: number;
  stepResults: FlowStepExecutionResult[];
  failedSteps: FlowStepExecutionResult[];
};
