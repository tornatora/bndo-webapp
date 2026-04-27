import { createClient } from '@/lib/supabase/server';
import { requireUserProfile } from '@/lib/auth';
import { hasAdminAccess, hasOpsAccess } from '@/lib/roles';
import {
  createBrowserbaseSession,
  closeBrowserbaseSession,
  browserbaseReady,
  browserbaseRecorderReady,
  primeBrowserbaseSessionToInvitalia,
} from '@/lib/copilot/browserbase';
import {
  buildCopilotClientPayload,
  listClientApplications,
  listCopilotClientsForViewer,
  listCopilotTemplatesForViewer,
} from '@/lib/copilot/client-payload';
import { enqueueCopilotWorkerJob } from '@/lib/copilot/worker-queue';
import type {
  ConfirmFinalSubmitInput,
  SaveRecordedTemplateInput,
  StartCopilotSessionInput,
  StartRecordingSessionInput,
  StopSessionInput,
  CopilotSessionLite,
  RetryWithAiInput,
} from '@/lib/copilot/types';

type CopilotViewer = {
  user: { id: string };
  profile: {
    id: string;
    role: string;
    company_id: string | null;
  };
};

type TemplateLifecycleAction = 'activate' | 'deactivate' | 'duplicate' | 'soft_delete' | 'restore';

async function ensureCopilotViewer(): Promise<CopilotViewer> {
  const { user, profile } = await requireUserProfile();
  const allowedRoles = new Set(['client_admin', 'consultant', 'ops_admin']);
  if (!allowedRoles.has(String(profile.role))) {
    throw new Error('Accesso non autorizzato al Co-pilot.');
  }
  return {
    user: { id: user.id },
    profile: {
      id: profile.id,
      role: profile.role,
      company_id: profile.company_id,
    },
  };
}

async function logSessionEvent(args: {
  sessionId: string;
  level: 'info' | 'warning' | 'error';
  stepKey?: string;
  message: string;
  payload?: Record<string, unknown>;
}) {
  const supabase = createClient() as any;
  await supabase.from('copilot_session_events').insert({
    session_id: args.sessionId,
    level: args.level,
    step_key: args.stepKey ?? null,
    message: args.message,
    payload: args.payload ?? {},
  });
}

async function resolveEffectiveClientId(input: {
  supabase: any;
  viewer: CopilotViewer['profile'];
  clientId?: string | null;
  applicationId?: string | null;
}) {
  if (!hasOpsAccess(input.viewer.role)) {
    return input.viewer.id;
  }

  if (input.clientId) {
    return input.clientId;
  }

  if (!input.applicationId) {
    throw new Error('Seleziona un cliente prima di avviare la sessione.');
  }

  const { data: application, error: appError } = await input.supabase
    .from('tender_applications')
    .select('id, company_id')
    .eq('id', input.applicationId)
    .maybeSingle();

  if (appError) throw new Error(appError.message);
  if (!application?.company_id) throw new Error('Pratica non valida per il Co-pilot.');

  const { data: profile, error: profileError } = await input.supabase
    .from('profiles')
    .select('id')
    .eq('company_id', application.company_id)
    .eq('role', 'client_admin')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile?.id) throw new Error('Cliente non trovato per la pratica selezionata.');

  return String(profile.id);
}

async function readInitialUrlForTemplate(args: {
  supabase: any;
  templateId?: string | null;
}) {
  if (!args.templateId) return 'https://www.invitalia.it';

  const { data: template, error } = await args.supabase
    .from('copilot_templates')
    .select('id, domain, steps')
    .eq('id', args.templateId)
    .maybeSingle();

  if (error) return 'https://www.invitalia.it';
  if (!template) return 'https://www.invitalia.it';

  const steps = Array.isArray(template.steps) ? template.steps : [];
  const firstGoto = steps.find((step: any) => step?.type === 'goto' && typeof step?.url === 'string');
  if (firstGoto?.url) return String(firstGoto.url);

  if (typeof template.domain === 'string' && template.domain.trim()) {
    const normalized = template.domain.trim();
    if (/^https?:\/\//i.test(normalized)) return normalized;
    return `https://${normalized}`;
  }

  return 'https://www.invitalia.it';
}

export async function loadCopilotBootstrap() {
  const viewer = await ensureCopilotViewer();
  const [clients, templates] = await Promise.all([
    listCopilotClientsForViewer(viewer.profile),
    listCopilotTemplatesForViewer(viewer.profile),
  ]);

  return {
    clients,
    templates,
    viewerRole: viewer.profile.role,
    viewerId: viewer.profile.id,
    browserbaseReady: browserbaseReady(),
    browserbaseRecorderReady: browserbaseRecorderReady(),
  };
}

export async function loadCopilotClientContext(input: { clientId?: string | null; applicationId?: string | null }) {
  const viewer = await ensureCopilotViewer();
  const supabase = createClient() as any;

  const effectiveClientId = await resolveEffectiveClientId({
    supabase,
    viewer: viewer.profile,
    clientId: input.clientId ?? null,
    applicationId: input.applicationId ?? null,
  });

  const applications = await listClientApplications({
    viewerRole: viewer.profile.role,
    viewerCompanyId: viewer.profile.company_id,
    clientId: effectiveClientId,
  });
  const applicationList = applications as Array<{ id: string; practiceKey?: string | null }>;

  const chosenApplicationId =
    input.applicationId && applicationList.some((item) => item.id === input.applicationId)
      ? input.applicationId
      : applicationList[0]?.id;

  if (!chosenApplicationId) {
    return {
      applications,
      payload: null,
      effectiveClientId,
    };
  }

  const payload = await buildCopilotClientPayload({
    viewerRole: viewer.profile.role,
    viewerCompanyId: viewer.profile.company_id,
    clientId: effectiveClientId,
    applicationId: chosenApplicationId,
  });

  return {
    applications,
    payload,
    effectiveClientId,
  };
}

export async function startCopilotSession(input: StartCopilotSessionInput) {
  const viewer = await ensureCopilotViewer();
  const supabase = createClient() as any;
  const effectiveClientId = await resolveEffectiveClientId({
    supabase,
    viewer: viewer.profile,
    clientId: input.clientId ?? null,
    applicationId: input.applicationId ?? null,
  });

  if (!input.templateId) {
    throw new Error('Seleziona un template prima di avviare la compilazione.');
  }

  const preferDemo = input.runMode === 'demo_only';
  const useDemo = input.demoMode || preferDemo || !browserbaseReady();
  const nowIso = new Date().toISOString();

  const { data: inserted, error: insertError } = await supabase
    .from('copilot_sessions')
    .insert({
      user_id: viewer.profile.id,
      client_id: effectiveClientId,
      application_id: input.applicationId ?? null,
      template_id: input.templateId ?? null,
      practice_key: input.bandoKey,
      procedure_key: input.proceduraKey ?? 'default',
      status: useDemo ? 'running' : 'starting',
      progress: useDemo ? 4 : 1,
      current_step: useDemo ? 'demo_boot' : 'session_boot',
      current_message: useDemo ? 'Modalita DEMO avviata.' : 'Avvio sessione browser...',
      demo_mode: useDemo,
      started_at: nowIso,
    })
    .select('id, status, progress, current_message, current_step, live_view_url, demo_mode, template_id, practice_key, procedure_key')
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? 'Impossibile creare la sessione Co-pilot.');
  }

  let liveViewUrl: string | null = null;
  let browserbaseSessionId: string | null = null;

  if (!useDemo) {
    const created = await createBrowserbaseSession({});
    liveViewUrl = created.liveViewUrl;
    browserbaseSessionId = created.sessionId;

    const initialUrl = await readInitialUrlForTemplate({
      supabase,
      templateId: input.templateId,
    });

    const { error: updateError } = await supabase
      .from('copilot_sessions')
      .update({
        browserbase_session_id: browserbaseSessionId,
        live_view_url: liveViewUrl,
        status: 'running',
        progress: 5,
        current_step: 'worker_queue',
        current_message: 'Sessione live avviata. Eseguo i primi step...',
      })
      .eq('id', inserted.id)
      .eq('user_id', viewer.profile.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    void primeBrowserbaseSessionToInvitalia(created.connectUrl ?? null, initialUrl);
  } else {
    await supabase
      .from('copilot_sessions')
      .update({
        live_view_url: null,
        current_message: 'Modalita DEMO: simulazione compilazione attiva.',
      })
      .eq('id', inserted.id)
      .eq('user_id', viewer.profile.id);
  }

  await logSessionEvent({
    sessionId: inserted.id,
    level: 'info',
    stepKey: 'session_started',
    message: useDemo ? 'Sessione demo avviata.' : 'Sessione Browserbase avviata.',
    payload: {
      source: 'deterministic',
      browserbaseSessionId,
      liveViewUrl,
      bandoKey: input.bandoKey,
      proceduraKey: input.proceduraKey ?? 'default',
      hasCredentials: Boolean(input.credentials?.email || input.credentials?.password),
    },
  });

  try {
    await enqueueCopilotWorkerJob(inserted.id, {
      credentials: input.credentials,
      source: 'deterministic',
    });
  } catch (queueError) {
    await logSessionEvent({
      sessionId: inserted.id,
      level: 'warning',
      stepKey: 'worker_queue_failed',
      message: 'Coda worker non disponibile: avvio automatico non riuscito.',
      payload: {
        error: queueError instanceof Error ? queueError.message : String(queueError),
      },
    });
  }

  return {
    sessionId: inserted.id,
    liveViewUrl,
    demoMode: useDemo,
  };
}

export async function retrySessionWithAiFallback(input: RetryWithAiInput) {
  const viewer = await ensureCopilotViewer();
  if (!hasOpsAccess(viewer.profile.role)) {
    throw new Error('Fallback AI disponibile solo per admin e consulente.');
  }

  const supabase = createClient() as any;
  let sessionQuery = supabase
    .from('copilot_sessions')
    .select('id, user_id, status, current_step')
    .eq('id', input.sessionId)
    .limit(1);

  if (!hasAdminAccess(viewer.profile.role)) {
    sessionQuery = sessionQuery.eq('user_id', viewer.profile.id);
  }

  const { data: session, error } = await sessionQuery.maybeSingle();
  if (error) throw new Error(error.message);
  if (!session) throw new Error('Sessione non trovata.');

  const allowedStatuses = new Set(['waiting_human', 'failed', 'paused']);
  if (!allowedStatuses.has(String(session.status ?? ''))) {
    throw new Error('Fallback AI disponibile solo da stato in attesa, errore o pausa.');
  }

  const instruction = String(input.instruction ?? '').trim();
  const requestedStep = String(input.stepKey ?? session.current_step ?? '').trim();

  await logSessionEvent({
    sessionId: input.sessionId,
    level: 'info',
    stepKey: 'ai_fallback_requested',
    message: 'Richiesto retry manuale con fallback AI.',
    payload: {
      source: 'ai_fallback',
      requestedStep: requestedStep || null,
      instruction: instruction || null,
    },
  });

  const { error: updateError } = await supabase
    .from('copilot_sessions')
    .update({
      status: 'running',
      current_step: requestedStep || 'ai_fallback_requested',
      current_message: 'Fallback AI richiesto. Riprovo il passo corrente...',
    })
    .eq('id', input.sessionId);
  if (updateError) throw new Error(updateError.message);

  try {
    await enqueueCopilotWorkerJob(input.sessionId, {
      source: 'ai_fallback',
      instruction,
    });
  } catch (queueError) {
    await logSessionEvent({
      sessionId: input.sessionId,
      level: 'warning',
      stepKey: 'ai_fallback_queue_failed',
      message: 'Fallback AI richiesto ma worker non disponibile.',
      payload: {
        source: 'ai_fallback',
        error: queueError instanceof Error ? queueError.message : String(queueError),
      },
    });
    throw queueError;
  }

  return { ok: true };
}

export async function startRecordingSession(input: StartRecordingSessionInput) {
  const viewer = await ensureCopilotViewer();
  if (!hasOpsAccess(viewer.profile.role)) {
    throw new Error('Registrazione template disponibile solo per admin e consulente.');
  }

  const supabase = createClient() as any;
  const effectiveClientId = await resolveEffectiveClientId({
    supabase,
    viewer: viewer.profile,
    clientId: input.clientId,
    applicationId: input.applicationId,
  });

  const useDemo = input.demoMode || !browserbaseReady();
  if (!useDemo && !browserbaseRecorderReady()) {
    throw new Error(
      'Registrazione non disponibile: configura BROWSERBASE_EXTENSION_ID oppure usa DEMO mode.',
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from('copilot_sessions')
    .insert({
      user_id: viewer.profile.id,
      client_id: effectiveClientId,
      application_id: input.applicationId,
      practice_key: input.bandoKey,
      procedure_key: input.proceduraKey,
      status: 'recording',
      progress: 0,
      current_step: 'recording_init',
      current_message: 'Registrazione in corso. Naviga normalmente.',
      demo_mode: useDemo,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? 'Impossibile creare sessione di registrazione.');
  }

  let liveViewUrl: string | null = null;
  let browserbaseSessionId: string | null = null;

  if (!useDemo) {
    const created = await createBrowserbaseSession({ extensionId: process.env.BROWSERBASE_EXTENSION_ID });
    browserbaseSessionId = created.sessionId;
    liveViewUrl = created.liveViewUrl;
  }

  await supabase
    .from('copilot_sessions')
    .update({
      browserbase_session_id: browserbaseSessionId,
      live_view_url: liveViewUrl,
    })
    .eq('id', inserted.id)
    .eq('user_id', viewer.profile.id);

  await logSessionEvent({
    sessionId: inserted.id,
    level: 'info',
    stepKey: 'recording_started',
    message: 'Registrazione pratica avviata.',
    payload: {
      demoMode: useDemo,
      bandoKey: input.bandoKey,
      proceduraKey: input.proceduraKey,
      nameHint: input.nameHint ?? null,
    },
  });

  return {
    sessionId: inserted.id,
    liveViewUrl,
    demoMode: useDemo,
  };
}

function normalizeRecordedSteps(steps: unknown) {
  if (!Array.isArray(steps)) return [];
  return steps
    .filter((step) => step && typeof step === 'object' && typeof (step as any).type === 'string')
    .slice(0, 700);
}

async function resolveTemplateTargetForSave(args: {
  supabase: any;
  ownerId: string;
  bandoKey: string;
  proceduraKey: string;
  name: string;
  saveMode: 'new_version' | 'overwrite';
}) {
  const latestQuery = await args.supabase
    .from('copilot_templates')
    .select('id, version, name')
    .eq('created_by', args.ownerId)
    .eq('bando_key', args.bandoKey)
    .eq('procedura_key', args.proceduraKey)
    .neq('status', 'deleted')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestQuery.error) throw new Error(latestQuery.error.message);
  const latest = latestQuery.data as { id: string; version: number; name: string } | null;

  if (args.saveMode === 'overwrite' && latest?.id) {
    return {
      mode: 'update' as const,
      id: latest.id,
      version: Number(latest.version ?? 1),
      name: args.name || latest.name,
    };
  }

  return {
    mode: 'insert' as const,
    id: null,
    version: Number(latest?.version ?? 0) + 1,
    name: args.name,
  };
}

export async function saveRecordedTemplate(input: SaveRecordedTemplateInput) {
  const viewer = await ensureCopilotViewer();
  if (!hasOpsAccess(viewer.profile.role)) {
    throw new Error('Solo admin/consulente possono salvare template.');
  }

  const supabase = createClient() as any;

  const recordedSteps = normalizeRecordedSteps(input.recordedSteps);
  if (!recordedSteps.length) {
    throw new Error('Nessuno step registrato da salvare.');
  }

  const { data: sessionRow, error: sessionError } = await supabase
    .from('copilot_sessions')
    .select('id, user_id, browserbase_session_id')
    .eq('id', input.sessionId)
    .eq('user_id', viewer.profile.id)
    .maybeSingle();

  if (sessionError) throw new Error(sessionError.message);
  if (!sessionRow) throw new Error('Sessione registrazione non trovata.');

  const target = await resolveTemplateTargetForSave({
    supabase,
    ownerId: viewer.profile.id,
    bandoKey: input.bandoKey,
    proceduraKey: input.proceduraKey,
    name: input.name,
    saveMode: input.saveMode,
  });

  let templateId = target.id;

  if (target.mode === 'update' && target.id) {
    const { error } = await supabase
      .from('copilot_templates')
      .update({
        name: target.name,
        practice_key: input.bandoKey,
        bando_key: input.bandoKey,
        procedura_key: input.proceduraKey,
        domain: input.domain,
        status: input.status ?? 'active',
        steps: recordedSteps,
        field_mapping: input.fieldMapping ?? {},
        requires_final_confirmation: input.requiresFinalConfirmation,
        expected_duration_seconds: input.expectedDurationSeconds ?? null,
        deleted_at: null,
      })
      .eq('id', target.id)
      .eq('created_by', viewer.profile.id);

    if (error) throw new Error(error.message);
    templateId = target.id;
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from('copilot_templates')
      .insert({
        name: target.name,
        practice_key: input.bandoKey,
        bando_key: input.bandoKey,
        procedura_key: input.proceduraKey,
        domain: input.domain,
        version: target.version,
        status: input.status ?? 'active',
        steps: recordedSteps,
        field_mapping: input.fieldMapping ?? {},
        requires_final_confirmation: input.requiresFinalConfirmation,
        expected_duration_seconds: input.expectedDurationSeconds ?? null,
        created_by: viewer.profile.id,
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      throw new Error(insertError?.message ?? 'Salvataggio template fallito.');
    }
    templateId = inserted.id;
  }

  await supabase
    .from('copilot_sessions')
    .update({
      template_id: templateId,
      status: 'completed',
      progress: 100,
      current_step: 'recording_saved',
      current_message: 'Template salvato. Pronto per l\'esecuzione.',
      completed_at: new Date().toISOString(),
    })
    .eq('id', input.sessionId)
    .eq('user_id', viewer.profile.id);

  await closeBrowserbaseSession(sessionRow.browserbase_session_id ?? null);

  await logSessionEvent({
    sessionId: input.sessionId,
    level: 'info',
    stepKey: 'recording_saved',
    message: 'Template salvato con successo.',
    payload: {
      templateId,
      totalSteps: recordedSteps.length,
      mappedFields: Object.keys(input.fieldMapping ?? {}).length,
      saveMode: input.saveMode,
      bandoKey: input.bandoKey,
      proceduraKey: input.proceduraKey,
    },
  });

  return { templateId };
}

export async function updateTemplateLifecycle(input: {
  templateId: string;
  action: TemplateLifecycleAction;
}) {
  const viewer = await ensureCopilotViewer();
  if (!hasOpsAccess(viewer.profile.role)) {
    throw new Error('Solo admin/consulente possono gestire i template.');
  }

  const supabase = createClient() as any;
  let query = supabase
    .from('copilot_templates')
    .select('id, name, status, version, bando_key, procedura_key, practice_key, domain, steps, field_mapping, requires_final_confirmation, created_by')
    .eq('id', input.templateId)
    .limit(1);

  if (!hasAdminAccess(viewer.profile.role)) {
    query = query.eq('created_by', viewer.profile.id);
  }

  const { data: template, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!template) throw new Error('Template non trovato.');

  if (input.action === 'activate') {
    const { error: updateError } = await supabase
      .from('copilot_templates')
      .update({ status: 'active', deleted_at: null })
      .eq('id', input.templateId);
    if (updateError) throw new Error(updateError.message);
    return { ok: true, templateId: input.templateId };
  }

  if (input.action === 'deactivate') {
    const { error: updateError } = await supabase
      .from('copilot_templates')
      .update({ status: 'inactive' })
      .eq('id', input.templateId);
    if (updateError) throw new Error(updateError.message);
    return { ok: true, templateId: input.templateId };
  }

  if (input.action === 'soft_delete') {
    const { error: updateError } = await supabase
      .from('copilot_templates')
      .update({ status: 'deleted', deleted_at: new Date().toISOString() })
      .eq('id', input.templateId);
    if (updateError) throw new Error(updateError.message);
    return { ok: true, templateId: input.templateId };
  }

  if (input.action === 'restore') {
    const { error: updateError } = await supabase
      .from('copilot_templates')
      .update({ status: 'inactive', deleted_at: null })
      .eq('id', input.templateId);
    if (updateError) throw new Error(updateError.message);
    return { ok: true, templateId: input.templateId };
  }

  const { data: latest, error: latestError } = await supabase
    .from('copilot_templates')
    .select('version')
    .eq('created_by', template.created_by)
    .eq('bando_key', template.bando_key ?? template.practice_key)
    .eq('procedura_key', template.procedura_key ?? 'default')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw new Error(latestError.message);

  const nextVersion = Number(latest?.version ?? template.version ?? 0) + 1;
  const { data: inserted, error: insertError } = await supabase
    .from('copilot_templates')
    .insert({
      name: `${template.name} (Copia)`,
      practice_key: template.bando_key ?? template.practice_key,
      bando_key: template.bando_key ?? template.practice_key,
      procedura_key: template.procedura_key ?? 'default',
      domain: template.domain,
      version: nextVersion,
      status: 'draft',
      steps: template.steps ?? [],
      field_mapping: template.field_mapping ?? {},
      requires_final_confirmation: Boolean(template.requires_final_confirmation),
      created_by: template.created_by,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? 'Duplicazione template fallita.');
  }

  return { ok: true, templateId: inserted.id };
}

export async function submitWaitingHumanInput(input: {
  sessionId: string;
  fields?: Record<string, string>;
  otp?: string;
  message?: string;
}) {
  const viewer = await ensureCopilotViewer();
  if (!hasOpsAccess(viewer.profile.role)) {
    throw new Error('Gestione waiting_human disponibile solo per admin e consulente.');
  }
  const supabase = createClient() as any;

  let query = supabase
    .from('copilot_sessions')
    .select('id, user_id, status')
    .eq('id', input.sessionId)
    .limit(1);

  if (!hasOpsAccess(viewer.profile.role)) {
    query = query.eq('user_id', viewer.profile.id);
  }

  const { data: session, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!session) throw new Error('Sessione non trovata.');

  await supabase.from('copilot_session_events').insert({
    session_id: input.sessionId,
    level: 'info',
    step_key: 'waiting_human_input',
    message: input.message?.trim() || 'Dati inseriti da operatore.',
    payload: {
      fields: input.fields ?? {},
      otp: input.otp ? '__provided__' : null,
    },
  });

  await supabase
    .from('copilot_sessions')
    .update({
      status: 'running',
      current_step: 'waiting_human_resume',
      current_message: 'Input ricevuto. Riprendo il flusso...',
    })
    .eq('id', input.sessionId);

  try {
    await enqueueCopilotWorkerJob(input.sessionId, { source: 'deterministic' });
  } catch {
    // Best effort: keep the input persisted even if worker queue is unavailable.
  }

  return { ok: true };
}

export async function listAssistanceMessages(input: { sessionId: string }) {
  const viewer = await ensureCopilotViewer();
  const supabase = createClient() as any;

  let sessionQuery = supabase
    .from('copilot_sessions')
    .select('id, user_id')
    .eq('id', input.sessionId)
    .limit(1);
  if (!hasOpsAccess(viewer.profile.role)) {
    sessionQuery = sessionQuery.eq('user_id', viewer.profile.id);
  }

  const { data: session, error: sessionError } = await sessionQuery.maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!session) throw new Error('Sessione non trovata.');

  const { data: messages, error } = await supabase
    .from('copilot_session_assistance_messages')
    .select('id, sender_user_id, sender_role, body, context, created_at')
    .eq('session_id', input.sessionId)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) throw new Error(error.message);

  return {
    messages: (messages ?? []).map((row: any) => ({
      id: String(row.id),
      senderUserId: String(row.sender_user_id ?? ''),
      senderRole: String(row.sender_role ?? ''),
      body: String(row.body ?? ''),
      context: (row.context ?? {}) as Record<string, unknown>,
      createdAt: String(row.created_at ?? ''),
    })),
  };
}

export async function pushAssistanceMessage(input: {
  sessionId: string;
  body: string;
  context?: Record<string, unknown>;
}) {
  const viewer = await ensureCopilotViewer();
  const supabase = createClient() as any;

  let sessionQuery = supabase
    .from('copilot_sessions')
    .select('id, user_id, current_step, current_message')
    .eq('id', input.sessionId)
    .limit(1);
  if (!hasOpsAccess(viewer.profile.role)) {
    sessionQuery = sessionQuery.eq('user_id', viewer.profile.id);
  }

  const { data: session, error: sessionError } = await sessionQuery.maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!session) throw new Error('Sessione non trovata.');

  const trimmedBody = input.body.trim();
  if (!trimmedBody) {
    throw new Error('Messaggio assistenza vuoto.');
  }

  const { error } = await supabase.from('copilot_session_assistance_messages').insert({
    session_id: input.sessionId,
    sender_user_id: viewer.profile.id,
    sender_role: viewer.profile.role,
    body: trimmedBody,
    context: input.context ?? {},
  });
  if (error) throw new Error(error.message);

  await logSessionEvent({
    sessionId: input.sessionId,
    level: 'info',
    stepKey: 'assistance_chat',
    message: 'Nuovo messaggio assistenza.',
    payload: {
      senderRole: viewer.profile.role,
    },
  });

  return { ok: true };
}

export async function confirmFinalSubmit(input: ConfirmFinalSubmitInput) {
  const viewer = await ensureCopilotViewer();
  if (!hasOpsAccess(viewer.profile.role)) {
    throw new Error('Conferma finale disponibile solo per admin e consulente.');
  }
  const supabase = createClient() as any;

  let sessionQuery = supabase
    .from('copilot_sessions')
    .select('id, user_id, current_step')
    .eq('id', input.sessionId)
    .limit(1);

  if (!hasOpsAccess(viewer.profile.role)) {
    sessionQuery = sessionQuery.eq('user_id', viewer.profile.id);
  }

  const { data: session, error: sessionError } = await sessionQuery.maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!session) throw new Error('Sessione non trovata.');

  const resumePointer = /^wait_human_(\d+)$/.test(String(session.current_step ?? ''))
    ? `resume_from_${String(session.current_step).replace('wait_human_', '')}`
    : 'human_confirmed';

  const { error } = await supabase
    .from('copilot_sessions')
    .update({
      status: 'running',
      current_step: resumePointer,
      current_message: 'Conferma ricevuta. Riprendo il flusso...',
    })
    .eq('id', input.sessionId);

  if (error) throw new Error(error.message);

  await logSessionEvent({
    sessionId: input.sessionId,
    level: 'info',
    stepKey: 'human_confirmed',
    message: 'Conferma finale ricevuta dall\'operatore.',
  });

  try {
    await enqueueCopilotWorkerJob(input.sessionId, { source: 'deterministic' });
  } catch (queueError) {
    await logSessionEvent({
      sessionId: input.sessionId,
      level: 'warning',
      stepKey: 'worker_queue_failed',
      message: 'Worker non raggiungibile durante la ripresa.',
      payload: {
        error: queueError instanceof Error ? queueError.message : String(queueError),
      },
    });
  }

  return { ok: true };
}

export async function stopSession(input: StopSessionInput) {
  const viewer = await ensureCopilotViewer();
  if (!hasOpsAccess(viewer.profile.role)) {
    throw new Error('Stop sessione disponibile solo per admin e consulente.');
  }
  const supabase = createClient() as any;

  let sessionQuery = supabase
    .from('copilot_sessions')
    .select('id, user_id, browserbase_session_id')
    .eq('id', input.sessionId)
    .limit(1);

  if (!hasOpsAccess(viewer.profile.role)) {
    sessionQuery = sessionQuery.eq('user_id', viewer.profile.id);
  }

  const { data: sessionRow, error: sessionError } = await sessionQuery.maybeSingle();

  if (sessionError) throw new Error(sessionError.message);
  if (!sessionRow) throw new Error('Sessione non trovata.');

  await supabase
    .from('copilot_sessions')
    .update({
      status: 'paused',
      current_step: 'stopped_by_user',
      current_message: 'Sessione messa in pausa manualmente.',
    })
    .eq('id', sessionRow.id);

  await closeBrowserbaseSession(sessionRow.browserbase_session_id ?? null);

  await logSessionEvent({
    sessionId: sessionRow.id,
    level: 'warning',
    stepKey: 'stopped_by_user',
    message: 'Sessione fermata manualmente.',
  });

  return { ok: true };
}

export async function listSessionEvents(sessionId: string) {
  const viewer = await ensureCopilotViewer();
  const supabase = createClient() as any;

  let sessionQuery = supabase
    .from('copilot_sessions')
    .select('id, user_id')
    .eq('id', sessionId)
    .limit(1);

  if (!hasOpsAccess(viewer.profile.role)) {
    sessionQuery = sessionQuery.eq('user_id', viewer.profile.id);
  }

  const { data: session } = await sessionQuery.maybeSingle();

  if (!session) {
    throw new Error('Sessione non trovata.');
  }

  const [{ data: current }, { data: events }] = await Promise.all([
    supabase
      .from('copilot_sessions')
      .select('id, status, progress, current_message, current_step, live_view_url, demo_mode, template_id, practice_key, procedure_key')
      .eq('id', sessionId)
      .maybeSingle(),
    supabase
      .from('copilot_session_events')
      .select('id, level, step_key, message, payload, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(40),
  ]);

  return {
    session: (current ?? null) as CopilotSessionLite | null,
    events: events ?? [],
  };
}
