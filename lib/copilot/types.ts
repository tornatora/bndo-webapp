export type CopilotSessionStatus =
  | 'starting'
  | 'recording'
  | 'running'
  | 'waiting_human'
  | 'paused'
  | 'completed'
  | 'failed';

export type SelectorDef = {
  testId?: string;
  label?: string;
  placeholder?: string;
  css?: string;
  xpath?: string;
  text?: string;
  role?: string;
  name?: string;
  id?: string;
  inputType?: string;
  tag?: string;
};

export type StepMotionMeta = {
  stepId?: string;
  pageKey?: string;
  tabKey?: string;
  anchor?: string;
  clickPoint?: {
    xRatio: number;
    yRatio: number;
  };
  timing?: {
    preDelayMs?: number;
    postDelayMs?: number;
  };
  actionKind?:
    | 'click_only'
    | 'type'
    | 'select_open'
    | 'select_option'
    | 'upload'
    | 'submit'
    | 'scroll'
    | 'goto';
  confirmationStatus?: 'pending' | 'confirmed';
  reviewRequired?: boolean;
  confidence?: 'high' | 'medium' | 'low';
  viewport?: {
    width: number;
    height: number;
    scrollX: number;
    scrollY: number;
  };
  scrollMeta?: {
    startY?: number;
    endY?: number;
    deltaY?: number;
    semanticReason?: 'reached_bottom' | 'long_scroll' | 'section_scroll' | 'minor_scroll';
  };
  resolverMode?: 'primary' | 'semantic' | 'fallback_contextual' | 'guided_manual_resume';
  targetHint?: string;
};

export type MacroStep =
  | { type: 'goto'; url: string; waitUntil?: 'load' | 'networkidle' }
  | ({ type: 'click'; target: SelectorDef } & StepMotionMeta)
  | ({ type: 'type'; target: SelectorDef; valueFrom: string } & StepMotionMeta)
  | ({ type: 'select'; target: SelectorDef; valueFrom: string } & StepMotionMeta)
  | ({ type: 'upload'; target: SelectorDef; documentKey: string } & StepMotionMeta)
  | ({ type: 'scroll'; direction: 'up' | 'down'; amount?: number } & StepMotionMeta)
  | { type: 'waitFor'; target?: SelectorDef; timeoutMs?: number }
  | { type: 'waitHuman'; message: string }
  | { type: 'assertUrl'; contains: string };

export type CopilotTemplate = {
  id: string;
  name: string;
  bandoKey: string;
  proceduraKey: string;
  domain: string;
  version: number;
  status: 'draft' | 'active' | 'inactive' | 'deleted' | 'archived';
  steps: MacroStep[];
  fieldMapping: Record<string, string>;
  requiresFinalConfirmation: boolean;
  expectedDurationSeconds?: number;
};

export type CopilotClientPayload = {
  client: {
    fullName: string;
    email?: string;
    phone?: string;
    taxCode?: string;
    vatNumber?: string;
    address?: string;
    city?: string;
    province?: string;
    zip?: string;
    birthDate?: string;
    birthPlace?: string;
  };
  practice: {
    key: string;
    requestedAmount?: number;
    projectDescription?: string;
    [key: string]: unknown;
  };
  documents: Array<{
    id: string;
    name: string;
    category: string;
    signedUrl: string;
    localTempPath?: string;
  }>;
};

export type StartCopilotSessionInput = {
  clientId?: string | null;
  applicationId?: string | null;
  templateId?: string | null;
  bandoKey: string;
  proceduraKey?: string | null;
  demoMode: boolean;
  runMode?: 'real_or_demo_fallback' | 'demo_only';
  credentials?: {
    email?: string;
    password?: string;
  };
};

export type StartRecordingSessionInput = {
  clientId: string;
  applicationId: string;
  bandoKey: string;
  proceduraKey: string;
  nameHint?: string;
  demoMode: boolean;
};

export type SaveRecordedTemplateInput = {
  sessionId: string;
  name: string;
  bandoKey: string;
  proceduraKey: string;
  domain: string;
  requiresFinalConfirmation: boolean;
  saveMode: 'new_version' | 'overwrite';
  status?: 'draft' | 'active' | 'inactive';
  expectedDurationSeconds?: number;
  recordedSteps: MacroStep[];
  fieldMapping: Record<string, string>;
};

export type ConfirmFinalSubmitInput = {
  sessionId: string;
};

export type StopSessionInput = {
  sessionId: string;
};

export type RetryWithAiInput = {
  sessionId: string;
  stepKey?: string;
  instruction?: string;
};

export type CopilotSessionLite = {
  id: string;
  status: CopilotSessionStatus;
  progress: number;
  current_message: string | null;
  current_step: string | null;
  live_view_url: string | null;
  demo_mode: boolean;
  template_id: string | null;
  practice_key: string | null;
  procedure_key?: string | null;
};
