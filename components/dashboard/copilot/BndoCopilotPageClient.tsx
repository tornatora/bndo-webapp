'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { subscribeToChannelSafely, removeChannelSafely } from '@/lib/supabase/realtime-safe';

type BootstrapClient = {
  id: string;
  fullName: string;
  email: string;
  companyId: string;
  companyName: string;
};

type BootstrapTemplate = {
  id: string;
  name: string;
  practiceKey: string;
  bandoKey?: string;
  proceduraKey?: string;
  domain: string;
  status: string;
  version: number;
  updatedAt: string;
  createdBy?: string;
};

type Application = {
  id: string;
  status: string;
  updatedAt: string;
  title: string;
  practiceKey: string;
};

type ClientPayload = {
  client: {
    fullName: string;
    email?: string;
    phone?: string;
    taxCode?: string;
  };
  practice: {
    key: string;
    projectDescription?: string;
    requestedAmount?: number;
    applicationId: string;
    title: string;
  };
  documents: Array<{ id: string; name: string; category: string; signedUrl: string }>;
};

type SessionState = {
  id: string;
  status: 'starting' | 'recording' | 'running' | 'waiting_human' | 'paused' | 'completed' | 'failed';
  progress: number;
  current_message: string | null;
  current_step: string | null;
  live_view_url: string | null;
  demo_mode: boolean;
  template_id: string | null;
  practice_key: string | null;
  procedure_key?: string | null;
};

type SessionEvent = {
  id: string;
  level: 'info' | 'warning' | 'error';
  step_key: string | null;
  message: string;
  created_at: string;
  payload?: Record<string, unknown>;
};

type AssistanceMessage = {
  id: string;
  senderUserId: string;
  senderRole: string;
  body: string;
  context: Record<string, unknown>;
  createdAt: string;
};

type BootstrapResponse = {
  ok: boolean;
  clients: BootstrapClient[];
  templates: BootstrapTemplate[];
  browserbaseReady: boolean;
  browserbaseRecorderReady?: boolean;
  viewerRole: 'client_admin' | 'consultant' | 'ops_admin';
  context?: {
    applications: Application[];
    payload: ClientPayload | null;
    effectiveClientId?: string;
  };
};

const STATUS_LABEL: Record<SessionState['status'], string> = {
  starting: 'Avvio',
  recording: 'Registrazione',
  running: 'In corso',
  waiting_human: 'In attesa',
  paused: 'In pausa',
  completed: 'Completata',
  failed: 'Errore',
};

function statusColor(status: SessionState['status']) {
  if (status === 'completed') return '#16a34a';
  if (status === 'failed') return '#dc2626';
  if (status === 'waiting_human') return '#d97706';
  if (status === 'running') return '#2563eb';
  return '#475569';
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createMockInvitaliaHtml() {
  const html = `
  <!doctype html>
  <html lang="it">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>BNDO CO-PILOT DEMO</title>
      <style>
        :root { color-scheme: light; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Arial, sans-serif; background: #eef2ff; color: #0f172a; }
        .demo-label {
          position: fixed;
          top: 10px;
          left: 10px;
          z-index: 20;
          background: #0f172a;
          color: #fff;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .browser {
          margin: 14px;
          border: 1px solid #cbd5e1;
          border-radius: 14px;
          overflow: hidden;
          background: #fff;
          height: calc(100vh - 28px);
          box-shadow: 0 20px 40px rgba(15, 23, 42, 0.12);
          position: relative;
        }
        .topbar {
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid #e2e8f0;
          padding: 10px 14px;
          background: #f8fafc;
        }
        .dot { width: 10px; height: 10px; border-radius: 50%; background: #cbd5e1; }
        .url { flex: 1; border: 1px solid #d1d5db; border-radius: 999px; padding: 8px 12px; font-size: 12px; color: #334155; }
        .site { height: calc(100% - 52px); overflow: hidden; position: relative; }
        .page {
          position: absolute;
          inset: 0;
          animation: scrollDemo 24s linear infinite;
          transform: translateY(0);
          padding: 20px;
          background: linear-gradient(180deg, #ffffff, #f8fafc);
        }
        .hero { border-radius: 12px; border: 1px solid #dbeafe; padding: 16px; margin-bottom: 16px; background: #eff6ff; }
        .title { font-size: 22px; font-weight: 700; margin: 0 0 8px 0; }
        .sub { margin: 0; color: #475569; font-size: 14px; }
        .form { display: grid; gap: 14px; max-width: 860px; }
        .row { display: grid; gap: 8px; }
        .label { font-size: 13px; font-weight: 700; color: #334155; }
        .input { border: 1px solid #cbd5e1; border-radius: 8px; height: 38px; padding: 8px 10px; color: #64748b; }
        .select { border: 1px solid #cbd5e1; border-radius: 8px; height: 38px; padding: 8px 10px; color: #334155; }
        .upload { border: 1px dashed #94a3b8; border-radius: 10px; height: 74px; display: grid; place-items: center; color: #64748b; font-size: 13px; }
        .submit { margin-top: 10px; border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 14px; width: fit-content; background: #f1f5f9; color: #0f172a; font-weight: 700; }

        .cursor {
          position: absolute;
          width: 15px;
          height: 15px;
          border-radius: 50%;
          background: #0ea5e9;
          border: 2px solid #fff;
          z-index: 25;
          box-shadow: 0 0 0 0 rgba(14,165,233,0.35);
          transform: translate(-50%, -50%);
          animation: cursorMove 24s linear infinite;
        }

        @keyframes scrollDemo {
          0% { transform: translateY(0); }
          24% { transform: translateY(0); }
          50% { transform: translateY(-320px); }
          78% { transform: translateY(-640px); }
          100% { transform: translateY(0); }
        }

        @keyframes cursorMove {
          0% { left: 24%; top: 24%; box-shadow: 0 0 0 0 rgba(14,165,233,0.35); }
          12% { left: 25%; top: 34%; }
          22% { left: 25%; top: 34%; box-shadow: 0 0 0 10px rgba(14,165,233,0); }
          34% { left: 25%; top: 44%; }
          46% { left: 26%; top: 44%; box-shadow: 0 0 0 0 rgba(14,165,233,0.35); }
          58% { left: 26%; top: 58%; box-shadow: 0 0 0 10px rgba(14,165,233,0); }
          70% { left: 24%; top: 72%; }
          82% { left: 24%; top: 82%; box-shadow: 0 0 0 0 rgba(14,165,233,0.35); }
          100% { left: 24%; top: 24%; }
        }
      </style>
    </head>
    <body>
      <div class="demo-label">DEMO</div>
      <div class="browser">
        <div class="topbar">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          <div class="url">https://www.invitalia.it</div>
        </div>
        <div class="site">
          <div class="page">
            <section class="hero">
              <h1 class="title">Invitalia - Compilazione pratica</h1>
              <p class="sub">Simulazione visuale BNDO CO-PILOT: accesso, compilazione campi, upload documenti e conferma finale.</p>
            </section>
            <section class="form">
              <div class="row"><span class="label">Email</span><div class="input">cliente@email.it</div></div>
              <div class="row"><span class="label">Password</span><div class="input">••••••••</div></div>
              <div class="row"><span class="label">Descrizione progetto</span><div class="input">Attivita commerciale innovativa...</div></div>
              <div class="row"><span class="label">Forma giuridica</span><div class="select">Societa</div></div>
              <div class="row"><span class="label">Importo richiesto</span><div class="input">75.000</div></div>
              <div class="row"><span class="label">Documento DSAN</span><div class="upload">Upload documento in corso...</div></div>
              <button class="submit">Conferma invio pratica</button>
            </section>
          </div>
          <div class="cursor"></div>
        </div>
      </div>
    </body>
  </html>
  `;
  return html;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('it-IT');
}

function getTemplateBando(template: BootstrapTemplate) {
  return template.bandoKey || template.practiceKey || '';
}

function getTemplateProcedura(template: BootstrapTemplate) {
  return template.proceduraKey || 'default';
}

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  const json = (await response.json().catch(() => ({}))) as T & { error?: string; ok?: boolean };
  if (!response.ok || json.ok === false) {
    throw new Error(json.error ?? 'Operazione non riuscita.');
  }
  return json;
}

function maskUrl(url: string | null | undefined) {
  if (!url) return 'Avvio sessione...';
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

export function BndoCopilotPageClient() {
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [viewerRole, setViewerRole] = useState<'client_admin' | 'consultant' | 'ops_admin'>('client_admin');
  const [clients, setClients] = useState<BootstrapClient[]>([]);
  const [templates, setTemplates] = useState<BootstrapTemplate[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);

  const [clientId, setClientId] = useState<string>('');
  const [applicationId, setApplicationId] = useState<string>('');
  const [bandoKey, setBandoKey] = useState<string>('');
  const [proceduraKey, setProceduraKey] = useState<string>('default');
  const [templateId, setTemplateId] = useState<string>('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateStatusFilter, setTemplateStatusFilter] = useState<'all' | 'active' | 'draft' | 'inactive' | 'deleted'>('all');

  const [credentialsEmail, setCredentialsEmail] = useState('');
  const [credentialsPassword, setCredentialsPassword] = useState('');

  const [browserbaseReady, setBrowserbaseReady] = useState(false);
  const [demoModeToggle, setDemoModeToggle] = useState(false);

  const [payload, setPayload] = useState<ClientPayload | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');

  const [startModalOpen, setStartModalOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<AssistanceMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

  const [waitingModalOpen, setWaitingModalOpen] = useState(false);
  const [waitingFields, setWaitingFields] = useState<Record<string, string>>({});
  const [waitingOtp, setWaitingOtp] = useState('');
  const [clientStartOpened, setClientStartOpened] = useState(false);

  const [isMobile, setIsMobile] = useState(false);

  const canOperateRun = viewerRole === 'ops_admin' || viewerRole === 'consultant';
  const isClientMode = viewerRole === 'client_admin';
  const showCopilotEntrypoints = false;

  const selectedApplication = useMemo(
    () => applications.find((item) => item.id === applicationId) ?? null,
    [applications, applicationId],
  );

  const filteredTemplates = useMemo(() => {
    const normalizedSearch = templateSearch.trim().toLowerCase();
    return templates.filter((template) => {
      if (templateStatusFilter !== 'all' && template.status !== templateStatusFilter) return false;
      if (bandoKey && getTemplateBando(template) !== bandoKey) return false;
      if (proceduraKey && getTemplateProcedura(template) !== proceduraKey) return false;

      if (!normalizedSearch) return true;
      const haystack = `${template.name} ${getTemplateBando(template)} ${getTemplateProcedura(template)} ${template.domain}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [templates, templateSearch, templateStatusFilter, bandoKey, proceduraKey]);

  const templateProcedureOptions = useMemo(() => {
    const options = new Set<string>();
    templates.forEach((template) => {
      const bando = getTemplateBando(template);
      if (bandoKey && bando !== bandoKey) return;
      options.add(getTemplateProcedura(template));
    });
    return Array.from(options);
  }, [templates, bandoKey]);

  const clientBandoOptions = useMemo(() => {
    const options = new Set<string>();
    applications.forEach((application) => {
      if (application.practiceKey) {
        options.add(application.practiceKey);
      }
    });
    templates.forEach((template) => {
      const bando = getTemplateBando(template);
      if (bando) options.add(bando);
    });
    return Array.from(options);
  }, [applications, templates]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId) ?? null,
    [templates, templateId],
  );
  const hasClientTemplateForSelection = useMemo(
    () =>
      templates.some(
        (template) =>
          template.status === 'active' &&
          (!bandoKey || getTemplateBando(template) === bandoKey) &&
          (!proceduraKey || getTemplateProcedura(template) === proceduraKey),
      ),
    [templates, bandoKey, proceduraKey],
  );

  const liveIframeSrc = useMemo(() => {
    if (!session?.live_view_url || session.demo_mode) return null;
    const separator = session.live_view_url.includes('?') ? '&' : '?';
    return `${session.live_view_url}${separator}navbar=false`;
  }, [session?.live_view_url, session?.demo_mode]);

  const latestEvent = events[0] ?? null;
  const sessionStatus: SessionState['status'] = session?.status ?? 'paused';
  const progress = Math.max(0, Math.min(100, Number(session?.progress ?? 0)));
  const currentMessage = (session?.current_message || latestEvent?.message || 'Sessione non avviata.').slice(0, 180);
  const currentUrlLabel = liveIframeSrc ? maskUrl(liveIframeSrc) : 'Avvio sessione...';

  useEffect(() => {
    const onResize = () => {
      if (typeof window === 'undefined') return;
      setIsMobile(window.innerWidth < 1024);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  async function loadBootstrap(args?: { explicitClientId?: string | null; explicitApplicationId?: string | null }) {
    const queryClientId = args?.explicitClientId ?? searchParams.get('clientId');
    const queryApplicationId = args?.explicitApplicationId ?? searchParams.get('applicationId');

    const params = new URLSearchParams();
    if (queryClientId) params.set('clientId', queryClientId);
    if (queryApplicationId) params.set('applicationId', queryApplicationId);

    const suffix = params.toString() ? `?${params.toString()}` : '';
    const data = await fetchJson<BootstrapResponse>(`/api/copilot/bootstrap${suffix}`);

    setViewerRole(data.viewerRole);
    setBrowserbaseReady(Boolean(data.browserbaseReady));
    setClients(data.clients ?? []);
    setTemplates(data.templates ?? []);

    const nextClientId =
      data.context?.effectiveClientId ||
      queryClientId ||
      data.clients?.[0]?.id ||
      '';

    if (nextClientId) setClientId(nextClientId);

    if (data.context) {
      setApplications(data.context.applications ?? []);
      setPayload(data.context.payload ?? null);
      const nextAppId = queryApplicationId || data.context.applications?.[0]?.id || '';
      setApplicationId(nextAppId);

      const resolved = data.context.applications?.find((item) => item.id === nextAppId) ?? null;
      if (resolved?.practiceKey) {
        setBandoKey(resolved.practiceKey);
      }
    }
  }

  async function loadContext(input: { nextClientId?: string; nextApplicationId?: string }) {
    const selectedClientId = input.nextClientId ?? clientId;
    const selectedAppId = input.nextApplicationId ?? applicationId;

    if (!selectedClientId && !selectedAppId) return;

    const params = new URLSearchParams();
    if (selectedClientId) params.set('clientId', selectedClientId);
    if (selectedAppId) params.set('applicationId', selectedAppId);

    const data = await fetchJson<BootstrapResponse>(`/api/copilot/bootstrap?${params.toString()}`);
    const context = data.context;

    setApplications(context?.applications ?? []);
    setPayload(context?.payload ?? null);

    if (context?.effectiveClientId && context.effectiveClientId !== clientId) {
      setClientId(context.effectiveClientId);
    }

    const activeApplication =
      (selectedAppId && (context?.applications ?? []).find((item) => item.id === selectedAppId)) ||
      context?.applications?.[0] ||
      null;

    if (activeApplication) {
      setApplicationId(activeApplication.id);
      setBandoKey(activeApplication.practiceKey || 'generica');
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void loadBootstrap()
      .catch((cause) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Errore bootstrap Co-pilot.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!clientId && !applicationId) return;
    let cancelled = false;

    void loadContext({})
      .catch((cause) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Errore caricamento contesto cliente.');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, applicationId]);

  useEffect(() => {
    if (!activeSessionId) return;

    let cancelled = false;
    const supabase = createClient();

    const pull = async () => {
      try {
        const data = await fetchJson<{ ok: boolean; session: SessionState | null; events: SessionEvent[] }>(
          `/api/copilot/session-events?sessionId=${encodeURIComponent(activeSessionId)}`,
        );
        if (cancelled) return;
        if (data.session) setSession(data.session);
        setEvents(data.events ?? []);
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Errore aggiornamento sessione.');
      }
    };

    const channel = subscribeToChannelSafely(
      () =>
        (supabase as any)
          .channel(`copilot-realtime-${activeSessionId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'copilot_sessions',
              filter: `id=eq.${activeSessionId}`,
            },
            () => {
              void pull();
            },
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'copilot_session_events',
              filter: `session_id=eq.${activeSessionId}`,
            },
            () => {
              void pull();
            },
          )
          .subscribe(),
      'copilot-realtime',
    );

    const poll = window.setInterval(() => {
      void pull();
    }, 4500);

    void pull();

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      removeChannelSafely(supabase as any, channel as any, 'copilot-realtime');
    };
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId || !chatOpen) return;

    let cancelled = false;
    const loadChat = async () => {
      try {
        const data = await fetchJson<{ ok: boolean; messages: AssistanceMessage[] }>(
          `/api/copilot/assistance?sessionId=${encodeURIComponent(activeSessionId)}`,
        );
        if (cancelled) return;
        setChatMessages(data.messages ?? []);
      } catch {
        // best effort
      }
    };

    void loadChat();
    const timer = window.setInterval(() => {
      void loadChat();
    }, 6000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeSessionId, chatOpen]);

  useEffect(() => {
    if (!session) return;
    if (session.status === 'waiting_human') {
      setWaitingModalOpen(true);
      const missingKey =
        typeof latestEvent?.payload?.valueFrom === 'string' ? String(latestEvent?.payload?.valueFrom) : '';
      if (missingKey && !waitingFields[missingKey]) {
        setWaitingFields((prev) => ({ ...prev, [missingKey]: '' }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status, latestEvent?.id]);

  useEffect(() => {
    if (!showCopilotEntrypoints) return;
    const shouldOpenStart = searchParams.get('openStart') === '1';
    if (!shouldOpenStart) return;
    if (!canOperateRun) return;
    if (loading) return;
    setStartModalOpen(true);
  }, [canOperateRun, loading, searchParams, showCopilotEntrypoints]);

  useEffect(() => {
    if (!showCopilotEntrypoints) return;
    if (!isClientMode) return;
    if (loading) return;
    if (clientStartOpened) return;
    if (activeSessionId) return;
    setStartModalOpen(true);
    setClientStartOpened(true);
  }, [activeSessionId, clientStartOpened, isClientMode, loading, showCopilotEntrypoints]);

  useEffect(() => {
    if (!selectedApplication?.practiceKey) return;
    setBandoKey(selectedApplication.practiceKey);
  }, [selectedApplication?.practiceKey]);

  useEffect(() => {
    if (!isClientMode) return;
    if (bandoKey) return;
    if (clientBandoOptions.length === 0) return;
    setBandoKey(clientBandoOptions[0]);
  }, [bandoKey, clientBandoOptions, isClientMode]);

  useEffect(() => {
    if (!isClientMode) return;
    const options = templateProcedureOptions.length > 0 ? templateProcedureOptions : ['default'];
    if (options.includes(proceduraKey)) return;
    setProceduraKey(options[0]);
  }, [isClientMode, proceduraKey, templateProcedureOptions]);

  async function handleStartFromModal() {
    let effectiveTemplateId = templateId;
    let template = templates.find((item) => item.id === templateId) ?? null;

    if (!canOperateRun) {
      const ordered = templates
        .filter((item) => item.status === 'active')
        .sort((a, b) => (new Date(b.updatedAt).getTime() || 0) - (new Date(a.updatedAt).getTime() || 0));

      template =
        ordered.find(
          (item) =>
            getTemplateBando(item) === (bandoKey || selectedApplication?.practiceKey || getTemplateBando(item)) &&
            getTemplateProcedura(item) === (proceduraKey || 'default'),
        ) ??
        ordered.find((item) => getTemplateBando(item) === (bandoKey || selectedApplication?.practiceKey || '')) ??
        ordered[0] ??
        null;

      effectiveTemplateId = template?.id ?? '';
    }

    if (!effectiveTemplateId || !template) {
      setError('Nessun template attivo trovato per il bando selezionato.');
      return;
    }

    if (template.status !== 'active') {
      setError('Il template selezionato non è attivo. Attivalo prima di avviare.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const data = await fetchJson<{ ok: boolean; sessionId: string; liveViewUrl: string | null; demoMode: boolean }>(
        '/api/copilot/start-session',
        {
          method: 'POST',
          body: JSON.stringify({
            clientId: clientId || null,
            applicationId: applicationId || null,
            templateId: effectiveTemplateId,
            bandoKey: bandoKey || selectedApplication?.practiceKey || getTemplateBando(template),
            proceduraKey: proceduraKey || getTemplateProcedura(template),
            demoMode: canOperateRun ? demoModeToggle || !browserbaseReady : !browserbaseReady,
            runMode: 'real_or_demo_fallback',
            credentials: canOperateRun
              ? {
                  email: credentialsEmail || undefined,
                  password: credentialsPassword || undefined,
                }
              : undefined,
          }),
        },
      );

      setActiveSessionId(data.sessionId);
      setSession((prev) => ({
        id: data.sessionId,
        status: prev?.status ?? (data.demoMode ? 'running' : 'starting'),
        progress: prev?.progress ?? 1,
        current_message: prev?.current_message ?? 'Avvio sessione browser...',
        current_step: prev?.current_step ?? 'session_boot',
        live_view_url: data.liveViewUrl,
        demo_mode: data.demoMode,
        template_id: effectiveTemplateId,
        practice_key: bandoKey,
        procedure_key: proceduraKey,
      }));
      setStartModalOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Errore avvio sessione.');
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    if (!activeSessionId) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson('/api/copilot/stop-session', {
        method: 'POST',
        body: JSON.stringify({ sessionId: activeSessionId }),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Errore stop sessione.');
    } finally {
      setBusy(false);
    }
  }

  async function handleResume() {
    if (!activeSessionId) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson('/api/copilot/confirm-final-submit', {
        method: 'POST',
        body: JSON.stringify({ sessionId: activeSessionId }),
      });
      setWaitingModalOpen(false);
      setWaitingOtp('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Errore ripresa sessione.');
    } finally {
      setBusy(false);
    }
  }

  async function handleWaitingHumanSubmit() {
    if (!activeSessionId) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson('/api/copilot/waiting-human', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: activeSessionId,
          fields: waitingFields,
          otp: waitingOtp || undefined,
          message: 'Input inserito da dashboard Co-pilot.',
        }),
      });
      setWaitingModalOpen(false);
      setWaitingOtp('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Errore invio dati waiting_human.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRetryWithAi() {
    if (!activeSessionId) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson('/api/copilot/retry-with-ai', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: activeSessionId,
          stepKey: session?.current_step ?? latestEvent?.step_key ?? undefined,
          instruction: currentMessage || undefined,
        }),
      });
      setWaitingModalOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Errore retry AI.');
    } finally {
      setBusy(false);
    }
  }

  function handleNewSession() {
    if (busy) return;
    if (activeSessionId && typeof window !== 'undefined') {
      const confirmed = window.confirm('Vuoi chiudere la sessione attuale e avviarne una nuova?');
      if (!confirmed) return;
    }
    setActiveSessionId('');
    setSession(null);
    setEvents([]);
    setChatMessages([]);
    setChatOpen(false);
    setWaitingModalOpen(false);
    setWaitingFields({});
    setWaitingOtp('');
    setError(null);
  }

  async function handleSendAssistance() {
    if (!activeSessionId || !chatDraft.trim()) return;
    setChatBusy(true);
    try {
      await fetchJson('/api/copilot/assistance', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: activeSessionId,
          body: chatDraft.trim(),
          context: {
            step: session?.current_step ?? null,
            status: session?.status ?? null,
            url: liveIframeSrc ?? null,
          },
        }),
      });
      setChatDraft('');
      const data = await fetchJson<{ ok: boolean; messages: AssistanceMessage[] }>(
        `/api/copilot/assistance?sessionId=${encodeURIComponent(activeSessionId)}`,
      );
      setChatMessages(data.messages ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Errore invio assistenza.');
    } finally {
      setChatBusy(false);
    }
  }

  async function handleTemplateLifecycle(action: 'activate' | 'deactivate' | 'duplicate' | 'soft_delete' | 'restore') {
    if (!templateId) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson('/api/copilot/template-lifecycle', {
        method: 'POST',
        body: JSON.stringify({ templateId, action }),
      });
      await loadBootstrap({ explicitClientId: clientId || null, explicitApplicationId: applicationId || null });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Errore aggiornamento template.');
    } finally {
      setBusy(false);
    }
  }

  function openStartForApplication(nextApplicationId: string, nextPracticeKey: string) {
    setApplicationId(nextApplicationId);
    setBandoKey(nextPracticeKey || 'generica');
    const availableProcedures = templateProcedureOptions;
    if (availableProcedures.length > 0 && !availableProcedures.includes(proceduraKey)) {
      setProceduraKey(availableProcedures[0]);
    }
    setStartModalOpen(true);
  }

  const showBrowserFrame = Boolean(activeSessionId || session);

  if (loading) {
    return (
      <section className="panel p-5 sm:p-6" style={{ minHeight: 'calc(100vh - 160px)', display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center', display: 'grid', gap: 6 }}>
          <h1 className="welcome-title" style={{ margin: 0 }}>BNDO CO-PILOT</h1>
          <p className="welcome-subtitle" style={{ margin: 0 }}>Caricamento ambiente Co-pilot...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel p-4 sm:p-5" style={{ minHeight: 'calc(100vh - 160px)', display: 'grid', gap: 14, position: 'relative' }}>

      {canOperateRun ? (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'grid', gap: 4, minWidth: 230 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Cliente</span>
              <select
                value={clientId}
                onChange={(event) => {
                  setClientId(event.target.value);
                  setApplicationId('');
                }}
                style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 8 }}
              >
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.fullName} · {client.companyName}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 4, minWidth: 220 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Credenziali runtime (mai salvate)</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={credentialsEmail}
                  onChange={(event) => setCredentialsEmail(event.target.value)}
                  placeholder="Email"
                  style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 8, padding: 8 }}
                />
                <input
                  type="password"
                  value={credentialsPassword}
                  onChange={(event) => setCredentialsPassword(event.target.value)}
                  placeholder="Password"
                  style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 8, padding: 8 }}
                />
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', fontSize: 12, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={demoModeToggle || !browserbaseReady}
                onChange={(event) => setDemoModeToggle(event.target.checked)}
                disabled={!browserbaseReady}
              />
              DEMO {browserbaseReady ? '' : '(Browserbase non configurato)'}
            </label>
          </div>

          {error ? (
            <div style={{ border: '1px solid #fecaca', borderRadius: 10, background: '#fef2f2', color: '#7f1d1d', padding: 10, fontSize: 13 }}>
              {error}
            </div>
          ) : null}

          <section style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Pratiche attive</div>
            {applications.length === 0 ? (
              <div className="admin-item-sub">Nessuna pratica attiva per il cliente selezionato.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))' }}>
                {applications.map((app) => (
                  <article key={app.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, display: 'grid', gap: 8, background: '#fff' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{app.title}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Bando: {app.practiceKey} · {formatDate(app.updatedAt)}
                    </div>
                    {showCopilotEntrypoints ? (
                      <button className="btn-action" onClick={() => openStartForApplication(app.id, app.practiceKey)} disabled={busy}>
                        Avvia BNDO CO-PILOT
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      <div style={{ border: '1px solid rgba(15,23,42,0.12)', borderRadius: 14, overflow: 'hidden', position: 'relative', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #e2e8f0', padding: '10px 12px', background: '#f8fafc' }}>
          <div style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 999, padding: '7px 12px', fontSize: 12, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {session?.status === 'paused' && !liveIframeSrc ? 'Sessione in pausa' : currentUrlLabel}
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: statusColor(sessionStatus), textTransform: 'uppercase' }}>{STATUS_LABEL[sessionStatus]}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#334155', background: session?.demo_mode || demoModeToggle || !browserbaseReady ? '#fde68a' : '#d1fae5', borderRadius: 999, padding: '4px 8px' }}>
            {session?.demo_mode || demoModeToggle || !browserbaseReady ? 'DEMO' : 'LIVE'}
          </span>
        </div>

        <div style={{ height: isClientMode ? 'min(76vh, 840px)' : 'min(66vh, 720px)', background: '#f1f5f9', position: 'relative' }}>
          {!showBrowserFrame ? (
            <div style={{ height: '100%', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <h2 style={{ margin: 0, letterSpacing: '0.08em', fontSize: 28 }}>BNDO CO-PILOT</h2>
                {canOperateRun && showCopilotEntrypoints ? (
                  <button className="btn-action" onClick={() => setStartModalOpen(true)} disabled={busy || applications.length === 0}>
                    Avvia compilazione con BNDO
                  </button>
                ) : showCopilotEntrypoints ? (
                  <button className="btn-action" onClick={() => setStartModalOpen(true)} disabled={busy}>
                    Seleziona bando e procedura
                  </button>
                ) : null}
                {!showCopilotEntrypoints ? (
                  <div style={{ fontSize: 13, color: '#475569' }}>Entrypoint Co-pilot nascosti in questa versione.</div>
                ) : null}
              </div>
            </div>
          ) : isMobile ? (
            <div style={{ padding: 16, display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 13, color: '#334155' }}>Live browser disponibile solo desktop. Sessione attiva con tracking testuale.</div>
              <div style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 10, padding: 12, display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12, color: '#64748b' }}>{STATUS_LABEL[sessionStatus]}</div>
                <div style={{ width: '100%', height: 8, background: '#e2e8f0', borderRadius: 999 }}>
                  <div style={{ width: `${progress}%`, height: '100%', background: '#22c55e', borderRadius: 999 }} />
                </div>
                <div style={{ fontSize: 13, color: '#0f172a' }}>{currentMessage}</div>
              </div>
            </div>
          ) : liveIframeSrc ? (
            <iframe
              title="BNDO CO-PILOT Browser Live"
              src={liveIframeSrc}
              style={{ width: '100%', height: '100%', border: 0, background: '#111827' }}
              sandbox="allow-forms allow-modals allow-popups allow-scripts allow-same-origin"
            />
          ) : (
            <iframe
              title="BNDO CO-PILOT Demo"
              srcDoc={createMockInvitaliaHtml()}
              style={{ width: '100%', height: '100%', border: 0, background: '#e2e8f0' }}
              sandbox="allow-scripts"
            />
          )}
        </div>
      </div>

      <div style={{ position: 'sticky', bottom: 8, zIndex: 4, border: '1px solid #dbe3f0', borderRadius: 12, background: '#fff', padding: 12, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: '#334155', fontWeight: 700 }}>
            {events[0]?.step_key ? `${events[0].step_key} · ` : ''}{Math.round(progress)}% · {STATUS_LABEL[sessionStatus]}
          </div>
          {canOperateRun ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {showCopilotEntrypoints ? (
                <button className="btn-action" onClick={() => setStartModalOpen(true)} disabled={busy || applications.length === 0}>
                  Avvia compilazione con BNDO
                </button>
              ) : null}
              <button className="btn-action secondary" onClick={() => void handleStop()} disabled={busy || !activeSessionId}>
                Stop
              </button>
              <button className="btn-action secondary" onClick={() => void handleResume()} disabled={busy || !activeSessionId}>
                Riprendi
              </button>
              <button className="btn-action secondary" onClick={handleNewSession} disabled={busy}>
                Nuova sessione
              </button>
              {(sessionStatus === 'waiting_human' || sessionStatus === 'failed') ? (
                <button className="btn-action secondary" onClick={() => void handleRetryWithAi()} disabled={busy || !activeSessionId}>
                  Riprova con AI
                </button>
              ) : null}
              <button className="btn-action secondary" onClick={() => setChatOpen((prev) => !prev)}>
                Richiedi assistenza
              </button>
            </div>
          ) : null}
        </div>

        <div style={{ width: '100%', height: 8, background: '#e2e8f0', borderRadius: 999 }}>
          <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg,#0ea5e9,#22c55e)', borderRadius: 999, transition: 'width 220ms ease' }} />
        </div>
      </div>

      {!isClientMode ? (
        <div
        style={{
          position: 'fixed',
          right: 18,
          bottom: 16,
          width: chatOpen ? 330 : 190,
          borderRadius: 12,
          border: '1px solid #dbe3f0',
          background: '#fff',
          boxShadow: '0 10px 22px rgba(15,23,42,0.12)',
          zIndex: 8,
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          onClick={() => {
            setChatOpen((prev) => !prev);
            if (!chatOpen && activeSessionId && chatMessages.length === 0) {
              setChatDraft(`Richiesta assistenza sessione ${activeSessionId}. Stato: ${STATUS_LABEL[sessionStatus]}.`);
            }
          }}
          style={{ width: '100%', border: 0, background: '#f8fafc', color: '#0f172a', padding: '9px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}
        >
          Richiedi assistenza
        </button>

        {chatOpen ? (
          <div style={{ padding: 10, display: 'grid', gap: 8 }}>
            <div style={{ maxHeight: 150, overflow: 'auto', display: 'grid', gap: 6 }}>
              {chatMessages.length === 0 ? (
                <div style={{ fontSize: 11, color: '#64748b' }}>Nessun messaggio in questa sessione.</div>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 6, fontSize: 11 }}>
                    <div style={{ color: '#64748b', marginBottom: 3 }}>{msg.senderRole} · {formatDate(msg.createdAt)}</div>
                    <div style={{ color: '#0f172a' }}>{msg.body}</div>
                  </div>
                ))
              )}
            </div>

            <textarea
              rows={3}
              value={chatDraft}
              onChange={(event) => setChatDraft(event.target.value)}
              placeholder="Scrivi il messaggio per assistenza..."
              style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 8, resize: 'vertical', fontSize: 12 }}
            />
            <button className="btn-action" onClick={() => void handleSendAssistance()} disabled={chatBusy || !activeSessionId || !chatDraft.trim()}>
              {chatBusy ? 'Invio...' : 'Invia'}
            </button>
          </div>
        ) : null}
        </div>
      ) : null}

      {showCopilotEntrypoints && startModalOpen ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 20, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div style={{ width: 'min(760px, 100%)', borderRadius: 14, border: '1px solid #dbe3f0', background: '#fff', padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <strong style={{ fontSize: 16 }}>Avvia compilazione con BNDO</strong>
              <button className="btn-action secondary" onClick={() => setStartModalOpen(false)} disabled={busy}>Chiudi</button>
            </div>

            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
              {canOperateRun ? (
                <label style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Pratica</span>
                  <select
                    value={applicationId}
                    onChange={(event) => {
                      setApplicationId(event.target.value);
                      const app = applications.find((item) => item.id === event.target.value);
                      if (app?.practiceKey) setBandoKey(app.practiceKey);
                    }}
                    style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 8 }}
                  >
                    {applications.map((app) => (
                      <option key={app.id} value={app.id}>{app.title}</option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Bando</span>
                {isClientMode ? (
                  <select
                    value={bandoKey}
                    onChange={(event) => setBandoKey(event.target.value)}
                    style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 8 }}
                  >
                    {(clientBandoOptions.length ? clientBandoOptions : ['generica']).map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                ) : (
                  <input value={bandoKey} onChange={(event) => setBandoKey(event.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 8 }} />
                )}
              </label>

              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Procedura</span>
                <select value={proceduraKey} onChange={(event) => setProceduraKey(event.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 8 }}>
                  {(templateProcedureOptions.length ? templateProcedureOptions : ['default']).map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>

            {canOperateRun ? (
              <>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 160px' }}>
                    <input
                      value={templateSearch}
                      onChange={(event) => setTemplateSearch(event.target.value)}
                      placeholder="Cerca template per nome, bando o dominio"
                      style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 8 }}
                    />
                    <select
                      value={templateStatusFilter}
                      onChange={(event) => setTemplateStatusFilter(event.target.value as typeof templateStatusFilter)}
                      style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 8 }}
                    >
                      <option value="all">Tutti stati</option>
                      <option value="active">Attivo</option>
                      <option value="draft">Bozza</option>
                      <option value="inactive">Inattivo</option>
                      <option value="deleted">Eliminato</option>
                    </select>
                  </div>

                  <div style={{ maxHeight: 210, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, display: 'grid', gap: 0 }}>
                    {filteredTemplates.length === 0 ? (
                      <div style={{ padding: 12, fontSize: 12, color: '#64748b' }}>Nessun template trovato con i filtri correnti.</div>
                    ) : (
                      filteredTemplates.map((template) => {
                        const active = template.id === templateId;
                        return (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => {
                              setTemplateId(template.id);
                              setBandoKey(getTemplateBando(template));
                              setProceduraKey(getTemplateProcedura(template));
                            }}
                            style={{
                              border: 0,
                              borderBottom: '1px solid #f1f5f9',
                              background: active ? '#eff6ff' : '#fff',
                              cursor: 'pointer',
                              textAlign: 'left',
                              padding: 10,
                              display: 'grid',
                              gap: 4,
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                              <strong style={{ fontSize: 13 }}>{template.name}</strong>
                              <span style={{ fontSize: 10, textTransform: 'uppercase', color: statusColor((template.status as SessionState['status']) || 'paused') }}>{template.status}</span>
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              {getTemplateBando(template)} · {getTemplateProcedura(template)} · v{template.version}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn-action secondary" onClick={() => void handleTemplateLifecycle('activate')} disabled={busy || !templateId}>Attiva</button>
                    <button className="btn-action secondary" onClick={() => void handleTemplateLifecycle('duplicate')} disabled={busy || !templateId}>Duplica</button>
                    <button className="btn-action secondary" onClick={() => void handleTemplateLifecycle('deactivate')} disabled={busy || !templateId}>Disattiva</button>
                    <button className="btn-action secondary" onClick={() => void handleTemplateLifecycle('soft_delete')} disabled={busy || !templateId}>Elimina</button>
                    <button className="btn-action secondary" onClick={() => void handleTemplateLifecycle('restore')} disabled={busy || !templateId}>Ripristina</button>
                  </div>
                  <button className="btn-action" onClick={() => void handleStartFromModal()} disabled={busy || !templateId}>
                    {busy ? 'Avvio...' : 'Avvia compilazione con BNDO'}
                  </button>
                </div>

                {!selectedTemplate ? (
                  <div style={{ fontSize: 12, color: '#92400e' }}>Seleziona un template attivo per avviare la sessione.</div>
                ) : null}
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, color: '#475569' }}>
                  Seleziona bando e procedura: il sistema apre automaticamente il browser con il template attivo.
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    className="btn-action"
                    onClick={() => void handleStartFromModal()}
                    disabled={busy || !bandoKey || !proceduraKey || !hasClientTemplateForSelection}
                  >
                    {busy ? 'Avvio...' : 'Apri browser'}
                  </button>
                </div>
                {!hasClientTemplateForSelection ? (
                  <div style={{ fontSize: 12, color: '#92400e' }}>
                    Nessun template attivo disponibile per questa combinazione bando/procedura.
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}

      {waitingModalOpen ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 21, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div style={{ width: 'min(520px,100%)', borderRadius: 14, background: '#fff', border: '1px solid #dbe3f0', padding: 16, display: 'grid', gap: 10 }}>
            <strong style={{ fontSize: 15 }}>Compila i campi richiesti</strong>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {sessionStatus === 'failed'
                ? 'Si è verificato un problema: apri assistenza o inserisci i dati richiesti per proseguire.'
                : 'Serve intervento umano per continuare la compilazione.'}
            </div>

            {Object.keys(waitingFields).length === 0 ? (
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Messaggio</span>
                <input
                  value={waitingFields.note ?? ''}
                  onChange={(event) => setWaitingFields((prev) => ({ ...prev, note: event.target.value }))}
                  style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 8 }}
                  placeholder="Inserisci nota o conferma"
                />
              </label>
            ) : (
              Object.keys(waitingFields).map((fieldKey) => (
                <label key={fieldKey} style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{fieldKey}</span>
                  <input
                    value={waitingFields[fieldKey] ?? ''}
                    onChange={(event) =>
                      setWaitingFields((prev) => ({
                        ...prev,
                        [fieldKey]: event.target.value,
                      }))
                    }
                    style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 8 }}
                  />
                </label>
              ))
            )}

            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>OTP (se richiesto)</span>
              <input
                value={waitingOtp}
                onChange={(event) => setWaitingOtp(event.target.value)}
                style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 8 }}
                placeholder="Codice OTP"
              />
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {canOperateRun ? (
                <button className="btn-action secondary" onClick={() => void handleRetryWithAi()} disabled={busy || !activeSessionId}>
                  Riprova con AI
                </button>
              ) : null}
              <button className="btn-action secondary" onClick={() => setWaitingModalOpen(false)} disabled={busy}>Chiudi</button>
              <button className="btn-action" onClick={() => void handleWaitingHumanSubmit()} disabled={busy}>
                {busy ? 'Invio...' : 'Continua'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
