import type { Json } from '@/lib/supabase/database.types';
import { isMissingTable } from '@/lib/ops/dbErrorGuards';
import { sendGenericNotificationEmail } from '@/lib/services/email';
import { getSupabaseAdmin, hasRealServiceRoleKey } from '@/lib/supabase/admin';
import { APP_URL } from '@/shared/lib';

export type NotificationRole = 'client_admin' | 'consultant' | 'ops_admin';

export type NotificationEventType =
  | 'quiz_completed'
  | 'quiz_passed'
  | 'practice_created'
  | 'practice_status_changed'
  | 'assignment_updated'
  | 'payment_received'
  | 'document_requested'
  | 'document_uploaded_by_client'
  | 'document_uploaded_by_consultant'
  | 'chat_message_new'
  | 'practice_progress_updated'
  | 'payout_created'
  | 'payout_approved'
  | 'payout_paid'
  | 'operational_alert';

export type NotificationEventInput = {
  eventType: NotificationEventType;
  actorProfileId?: string | null;
  actorRole?: NotificationRole | null;
  companyId?: string | null;
  applicationId?: string | null;
  threadId?: string | null;
  consultantProfileId?: string | null;
  customerName?: string | null;
  practiceTitle?: string | null;
  documentLabel?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  progressLabel?: string | null;
  messagePreview?: string | null;
  payoutId?: string | null;
  actionPath?: string | null;
  entityId?: string | null;
  metadata?: Json;
  dedupeKey?: string | null;
};

type Recipient = {
  id: string;
  role: NotificationRole;
  fullName: string | null;
  email: string | null;
};

type BuildContext = {
  actorName: string;
  customerName: string;
  practiceTitle: string;
  companyName: string;
  documentLabel: string;
  amountLabel: string;
  progressLabel: string;
  messagePreview: string;
};

const GROUP_BY_EVENT: Record<NotificationEventType, 'lead_quiz' | 'pratiche' | 'documenti' | 'pagamenti' | 'chat' | 'consulenti' | 'sistema'> = {
  quiz_completed: 'lead_quiz',
  quiz_passed: 'lead_quiz',
  practice_created: 'pratiche',
  practice_status_changed: 'pratiche',
  assignment_updated: 'consulenti',
  payment_received: 'pagamenti',
  document_requested: 'documenti',
  document_uploaded_by_client: 'documenti',
  document_uploaded_by_consultant: 'documenti',
  chat_message_new: 'chat',
  practice_progress_updated: 'pratiche',
  payout_created: 'pagamenti',
  payout_approved: 'pagamenti',
  payout_paid: 'pagamenti',
  operational_alert: 'sistema'
};

function currencyLabel(amountCents?: number | null, currency?: string | null) {
  const cents = Number(amountCents ?? 0);
  if (!Number.isFinite(cents) || cents <= 0) return 'N/D';
  const curr = String(currency ?? 'EUR').toUpperCase();
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: curr
  }).format(cents / 100);
}

function buildAbsoluteActionPath(actionPath: string | null | undefined) {
  if (!actionPath) return null;
  if (/^https?:\/\//i.test(actionPath)) return actionPath;
  const cleanBase = APP_URL.replace(/\/+$/, '');
  const cleanPath = actionPath.startsWith('/') ? actionPath : `/${actionPath}`;
  return `${cleanBase}${cleanPath}`;
}

async function resolveContext(event: NotificationEventInput): Promise<BuildContext> {
  const admin = getSupabaseAdmin() as any;
  const context: BuildContext = {
    actorName: 'Utente BNDO',
    customerName: event.customerName?.trim() || 'Cliente',
    practiceTitle: event.practiceTitle?.trim() || 'Pratica',
    companyName: 'Cliente BNDO',
    documentLabel: event.documentLabel?.trim() || 'Documento',
    amountLabel: currencyLabel(event.amountCents, event.currency),
    progressLabel: event.progressLabel?.trim() || 'Aggiornamento pratica',
    messagePreview: event.messagePreview?.trim() || 'Nuovo messaggio ricevuto'
  };

  if (event.actorProfileId) {
    const { data: actor } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', event.actorProfileId)
      .maybeSingle();
    if (actor?.full_name) context.actorName = String(actor.full_name);
  }

  if (event.companyId) {
    const { data: company } = await admin
      .from('companies')
      .select('name')
      .eq('id', event.companyId)
      .maybeSingle();
    if (company?.name) context.companyName = String(company.name);
  }

  if (event.applicationId) {
    const { data: app } = await admin
      .from('tender_applications')
      .select('id, tender:tenders(title), company:companies(name)')
      .eq('id', event.applicationId)
      .maybeSingle();
    if (app?.tender?.title) context.practiceTitle = String(app.tender.title);
    if (app?.company?.name) context.companyName = String(app.company.name);
  }

  if (!event.customerName && event.companyId) {
    const { data: clientProfile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('company_id', event.companyId)
      .eq('role', 'client_admin')
      .limit(1)
      .maybeSingle();
    if (clientProfile?.full_name) {
      context.customerName = String(clientProfile.full_name);
    }
  }

  return context;
}

async function fetchRecipients(event: NotificationEventInput): Promise<Recipient[]> {
  const admin = getSupabaseAdmin() as any;
  const recipients = new Map<string, Recipient>();

  const addRecipients = (rows: Array<{ id: string; role: NotificationRole; full_name?: string | null; email?: string | null }>) => {
    for (const row of rows) {
      recipients.set(row.id, {
        id: row.id,
        role: row.role,
        fullName: row.full_name ?? null,
        email: row.email ?? null
      });
    }
  };

  const { data: admins } = await admin
    .from('profiles')
    .select('id, role, full_name, email')
    .eq('role', 'ops_admin');
  addRecipients((admins ?? []) as Array<{ id: string; role: NotificationRole; full_name?: string | null; email?: string | null }>);

  if (event.companyId) {
    const { data: clients } = await admin
      .from('profiles')
      .select('id, role, full_name, email')
      .eq('company_id', event.companyId)
      .eq('role', 'client_admin');
    addRecipients((clients ?? []) as Array<{ id: string; role: NotificationRole; full_name?: string | null; email?: string | null }>);
  }

  if (event.consultantProfileId) {
    const { data: consultant } = await admin
      .from('profiles')
      .select('id, role, full_name, email')
      .eq('id', event.consultantProfileId)
      .maybeSingle();
    if (consultant?.id) {
      addRecipients([consultant as { id: string; role: NotificationRole; full_name?: string | null; email?: string | null }]);
    }
  }

  if (!event.consultantProfileId && event.applicationId) {
    const { data: assignment, error } = await admin
      .from('consultant_practice_assignments')
      .select('consultant_profile_id')
      .eq('application_id', event.applicationId)
      .eq('status', 'active')
      .maybeSingle();

    if (!error && assignment?.consultant_profile_id) {
      const { data: consultant } = await admin
        .from('profiles')
        .select('id, role, full_name, email')
        .eq('id', assignment.consultant_profile_id)
        .maybeSingle();
      if (consultant?.id) {
        addRecipients([consultant as { id: string; role: NotificationRole; full_name?: string | null; email?: string | null }]);
      }
    }
  }

  if (!event.consultantProfileId && event.threadId) {
    const { data: threadConsultants } = await admin
      .from('consultant_thread_participants')
      .select('profile_id')
      .eq('thread_id', event.threadId)
      .eq('participant_role', 'consultant')
      .limit(3);
    const consultantIds = (threadConsultants ?? []).map((row: { profile_id?: string | null }) => row.profile_id).filter(Boolean) as string[];
    if (consultantIds.length > 0) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, role, full_name, email')
        .in('id', consultantIds);
      addRecipients((profiles ?? []) as Array<{ id: string; role: NotificationRole; full_name?: string | null; email?: string | null }>);
    }
  }

  return [...recipients.values()];
}

function defaultActionPath(event: NotificationEventInput, role: NotificationRole) {
  if (event.actionPath) return event.actionPath;
  switch (event.eventType) {
    case 'quiz_completed':
    case 'quiz_passed':
      return role === 'ops_admin' ? '/admin/quiz-responses' : '/dashboard/new-practice';
    case 'practice_created':
      if (role === 'ops_admin') return '/admin/assignments';
      if (role === 'consultant') return '/consultant/practices';
      return '/dashboard/pratiche';
    case 'practice_status_changed':
    case 'practice_progress_updated':
      if (role === 'ops_admin') return '/admin';
      if (role === 'consultant') return event.applicationId ? `/consultant/practices/${event.applicationId}` : '/consultant/practices';
      return event.applicationId ? `/dashboard/practices/${event.applicationId}` : '/dashboard/pratiche';
    case 'assignment_updated':
      if (role === 'ops_admin') return '/admin/assignments';
      if (role === 'consultant') return event.applicationId ? `/consultant/practices/${event.applicationId}` : '/consultant/practices';
      return event.applicationId ? `/dashboard/practices/${event.applicationId}` : '/dashboard/pratiche';
    case 'payment_received':
      if (role === 'ops_admin') return '/admin/finance';
      if (role === 'consultant') return '/consultant/billing';
      return '/dashboard/pratiche';
    case 'payout_created':
    case 'payout_approved':
    case 'payout_paid':
      return role === 'ops_admin' ? '/admin/finance' : '/consultant/billing';
    case 'document_requested':
    case 'document_uploaded_by_client':
    case 'document_uploaded_by_consultant':
      if (role === 'ops_admin') return '/admin';
      if (role === 'consultant') return event.applicationId ? `/consultant/practices/${event.applicationId}` : '/consultant/practices';
      return event.applicationId ? `/dashboard/practices/${event.applicationId}` : '/dashboard/documents';
    case 'chat_message_new':
      if (role === 'ops_admin') return '/admin';
      if (role === 'consultant') return event.applicationId ? `/consultant/practices/${event.applicationId}` : '/consultant';
      return '/dashboard/messages';
    case 'operational_alert':
      return '/admin';
    default:
      return role === 'ops_admin' ? '/admin' : '/dashboard/notifications';
  }
}

function copyForRole(event: NotificationEventInput, role: NotificationRole, ctx: BuildContext) {
  switch (event.eventType) {
    case 'quiz_completed':
      return {
        title: `${ctx.customerName} ha completato il quiz`,
        body: `Esito pre-check disponibile per ${ctx.practiceTitle}.`
      };
    case 'quiz_passed':
      return {
        title: `${ctx.customerName} ha superato il quiz`,
        body: `Il cliente risulta idoneo/probabile idoneo per ${ctx.practiceTitle}.`
      };
    case 'practice_created':
      return role === 'client_admin'
        ? {
            title: `Pratica avviata: ${ctx.practiceTitle}`,
            body: 'Abbiamo ricevuto la tua richiesta. Ti aggiorniamo a ogni passaggio operativo.'
          }
        : {
            title: `${ctx.customerName} ha avviato la pratica`,
            body: `Pratica: ${ctx.practiceTitle}.`
          };
    case 'practice_status_changed':
      return {
        title: `Stato pratica aggiornato`,
        body: `${ctx.practiceTitle}: ${ctx.progressLabel}.`
      };
    case 'assignment_updated':
      return role === 'consultant'
        ? {
            title: `Nuova pratica assegnata`,
            body: `${ctx.customerName} - ${ctx.practiceTitle}.`
          }
        : role === 'client_admin'
          ? {
              title: `Consulente assegnato alla tua pratica`,
              body: `${ctx.practiceTitle}: puoi proseguire con i prossimi documenti.`
            }
          : {
              title: `Assegnazione consulente aggiornata`,
              body: `${ctx.customerName} - ${ctx.practiceTitle}.`
            };
    case 'payment_received':
      return {
        title: role === 'client_admin' ? 'Pagamento ricevuto' : `${ctx.customerName} ha pagato ${ctx.amountLabel}`,
        body: `Pratica: ${ctx.practiceTitle}.`
      };
    case 'document_requested':
      return role === 'client_admin'
        ? {
            title: `Documento richiesto: ${ctx.documentLabel}`,
            body: `Il consulente ha richiesto un documento aggiuntivo per ${ctx.practiceTitle}.`
          }
        : {
            title: `Richiesta documento inviata`,
            body: `${ctx.documentLabel} richiesto a ${ctx.customerName} (${ctx.practiceTitle}).`
          };
    case 'document_uploaded_by_client':
      return role === 'client_admin'
        ? {
            title: `Documento caricato`,
            body: `${ctx.documentLabel} inviato correttamente per ${ctx.practiceTitle}.`
          }
        : {
            title: `${ctx.customerName} ha caricato un documento`,
            body: `${ctx.documentLabel} • ${ctx.practiceTitle}.`
          };
    case 'document_uploaded_by_consultant':
      return role === 'client_admin'
        ? {
            title: `Nuovo documento dal consulente`,
            body: `${ctx.documentLabel} disponibile nella pratica ${ctx.practiceTitle}.`
          }
        : {
            title: `Documento consulente caricato`,
            body: `${ctx.documentLabel} caricato su ${ctx.practiceTitle}.`
          };
    case 'chat_message_new':
      return {
        title: role === 'client_admin' ? 'Nuovo messaggio del consulente' : `Nuovo messaggio da ${ctx.customerName}`,
        body: ctx.messagePreview
      };
    case 'practice_progress_updated':
      return {
        title: `Avanzamento pratica aggiornato`,
        body: `${ctx.practiceTitle}: ${ctx.progressLabel}.`
      };
    case 'payout_created':
      return {
        title: role === 'consultant' ? 'Nuovo payout disponibile' : 'Payout consulente creato',
        body: `${ctx.amountLabel} • ${ctx.practiceTitle}.`
      };
    case 'payout_approved':
      return {
        title: role === 'consultant' ? 'Payout approvato' : 'Payout approvato da admin',
        body: `${ctx.amountLabel} • ${ctx.practiceTitle}.`
      };
    case 'payout_paid':
      return {
        title: role === 'consultant' ? 'Payout pagato' : 'Payout consulente pagato',
        body: `${ctx.amountLabel} • ${ctx.practiceTitle}.`
      };
    case 'operational_alert':
      return {
        title: 'Alert operativo',
        body: ctx.messagePreview
      };
    default:
      return {
        title: 'Nuovo aggiornamento',
        body: ctx.messagePreview
      };
  }
}

function shouldDeliverToRecipient(event: NotificationEventInput, recipient: Recipient) {
  if (event.actorProfileId && recipient.id === event.actorProfileId) return false;

  if (recipient.role === 'ops_admin') return true;

  if (event.eventType === 'operational_alert') {
    return false;
  }

  if (event.eventType.startsWith('payout_')) {
    return recipient.role === 'consultant';
  }

  if (event.eventType === 'assignment_updated') {
    return true;
  }

  return true;
}

export async function emitNotificationEvent(event: NotificationEventInput) {
  if (!hasRealServiceRoleKey()) {
    return {
      ok: false,
      skipped: true,
      reason: 'missing_service_role_key'
    } as const;
  }

  const admin = getSupabaseAdmin() as any;

  const [recipients, context] = await Promise.all([fetchRecipients(event), resolveContext(event)]);
  if (recipients.length === 0) {
    return { ok: true, delivered: 0, skipped: true, reason: 'no_recipients' } as const;
  }

  const rows: Array<Record<string, unknown>> = [];
  const emailQueue: Array<{ toEmail: string; subject: string; title: string; body: string; actionUrl: string | null }> = [];

  for (const recipient of recipients) {
    if (!shouldDeliverToRecipient(event, recipient)) continue;

    const message = copyForRole(event, recipient.role, context);
    const actionPath = defaultActionPath(event, recipient.role);
    const actionUrl = buildAbsoluteActionPath(actionPath);

    rows.push({
      recipient_profile_id: recipient.id,
      recipient_role: recipient.role,
      event_type: event.eventType,
      event_group: GROUP_BY_EVENT[event.eventType],
      priority: 'high',
      title: message.title,
      body: message.body,
      entity_type: event.applicationId ? 'application' : event.companyId ? 'company' : 'generic',
      entity_id: event.entityId ?? event.applicationId ?? event.companyId ?? null,
      company_id: event.companyId ?? null,
      application_id: event.applicationId ?? null,
      thread_id: event.threadId ?? null,
      action_path: actionPath,
      payload: event.metadata ?? {},
      dedupe_key: event.dedupeKey ?? null
    });

    if (recipient.email) {
      emailQueue.push({
        toEmail: recipient.email,
        subject: `BNDO • ${message.title}`,
        title: message.title,
        body: message.body,
        actionUrl
      });
    }
  }

  if (rows.length === 0) {
    return { ok: true, delivered: 0, skipped: true, reason: 'all_recipients_filtered' } as const;
  }

  const insertResult = await admin.from('notification_inbox').insert(rows);
  if (insertResult.error) {
    if (isMissingTable(insertResult.error, 'notification_inbox')) {
      return {
        ok: false,
        skipped: true,
        reason: 'notification_inbox_missing'
      } as const;
    }
    throw new Error(insertResult.error.message);
  }

  await Promise.allSettled(
    emailQueue.map((entry) =>
      sendGenericNotificationEmail({
        toEmail: entry.toEmail,
        subject: entry.subject,
        title: entry.title,
        body: entry.body,
        actionUrl: entry.actionUrl
      })
    )
  );

  return {
    ok: true,
    delivered: rows.length,
    emailed: emailQueue.length
  } as const;
}

export const __notificationTestUtils = {
  currencyLabel,
  defaultActionPath,
  copyForRole,
  shouldDeliverToRecipient
};
