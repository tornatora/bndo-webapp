import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStripeClient } from '@/lib/stripe';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { provisionAccountFromCheckout } from '@/lib/services/provisioning';
import { ensureBandoApplication, practiceTitle, type PracticeType } from '@/lib/bandi';
import { upsertProgressIntoNotes } from '@/lib/admin/practice-progress';
import { LEGAL_LAST_UPDATED } from '@/lib/legal';
import type { Json } from '@/lib/supabase/database.types';
import { randomUUID } from 'crypto';
import { AUTO_REPLY_BODY } from '@/lib/chat/constants';
import {
  enforceRateLimit,
  getClientIp,
  publicError,
  rejectCrossSiteMutation,
  safeSessionId
} from '@/lib/security/http';

export const runtime = 'nodejs';

const TextSchema = z.object({
  sessionId: z.string().trim().min(8).optional().nullable(),
  practiceType: z.enum(['resto_sud_2_0', 'autoimpiego_centro_nord']).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  pec: z.string().trim().min(3).max(160),
  digitalSignature: z.enum(['yes', 'no']),
  quotesText: z.string().trim().max(2000).optional().nullable(),
  projectSummary: z.string().trim().max(2000).optional().nullable(),
  acceptPrivacy: z.enum(['yes']),
  acceptTerms: z.enum(['yes']),
  consentStorage: z.enum(['yes'])
});

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function moneyFromStripe(amountTotal: number | null | undefined, currency: string | null | undefined) {
  if (!amountTotal || !currency) return null;
  const isZeroDecimal = new Set(['jpy', 'krw', 'vnd']).has(currency.toLowerCase());
  return isZeroDecimal ? amountTotal : amountTotal / 100;
}

async function ensureOpsAutoReply(threadId: string) {
  const admin = getSupabaseAdmin();
  const { data: opsProfile } = await admin
    .from('profiles')
    .select('id, role')
    .in('role', ['consultant', 'ops_admin'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!opsProfile?.id) return;

  await admin.from('consultant_thread_participants').upsert(
    {
      thread_id: threadId,
      profile_id: opsProfile.id,
      participant_role: opsProfile.role,
      last_read_at: new Date().toISOString()
    },
    { onConflict: 'thread_id,profile_id' }
  );

  await admin.from('consultant_messages').insert({
    thread_id: threadId,
    sender_profile_id: opsProfile.id,
    body: AUTO_REPLY_BODY
  });
}

function practiceTypeFromQuiz(bandoType: string | null | undefined): PracticeType | null {
  const t = (bandoType ?? '').toLowerCase();
  if (t === 'sud') return 'resto_sud_2_0';
  if (t === 'centro_nord') return 'autoimpiego_centro_nord';
  return null;
}

export async function POST(request: Request) {
  try {
    const crossSite = rejectCrossSiteMutation(request);
    if (crossSite) return crossSite;

    const rateLimit = enforceRateLimit({
      namespace: 'onboarding-complete',
      key: getClientIp(request),
      limit: 18,
      windowMs: 10 * 60_000
    });
    if (rateLimit) return rateLimit;

    const supabaseAdmin = getSupabaseAdmin();
    // Stripe is optional for manual onboarding flows.

    const formData = await request.formData();
    const ipAddress = getClientIp(request);
    const userAgent = request.headers.get('user-agent');

    const parsed = TextSchema.safeParse({
      sessionId: formData.get('sessionId'),
      practiceType: formData.get('practiceType'),
      email: formData.get('email'),
      pec: formData.get('pec'),
      digitalSignature: formData.get('digitalSignature'),
      quotesText: formData.get('quotesText'),
      projectSummary: formData.get('projectSummary'),
      acceptPrivacy: formData.get('acceptPrivacy'),
      acceptTerms: formData.get('acceptTerms'),
      consentStorage: formData.get('consentStorage')
    });

    if (!parsed.success) {
      return NextResponse.json({ error: 'Dati non validi.' }, { status: 422 });
    }

    const providedSessionId = safeSessionId(parsed.data.sessionId ?? null) ?? '';
    const providedEmail = (parsed.data.email ?? '').trim();
    if (!providedSessionId && !providedEmail) {
      return NextResponse.json({ error: 'Inserisci la tua email.' }, { status: 422 });
    }

    const idDocument = formData.get('idDocument');
    const taxCodeDocument = formData.get('taxCodeDocument');
    const didDocument = formData.get('didDocument');
    const quotes = formData.getAll('quotes');

    if (!(idDocument instanceof File) || !(taxCodeDocument instanceof File)) {
      return NextResponse.json({ error: 'Carica documento identita e codice fiscale.' }, { status: 422 });
    }

    if (!(didDocument instanceof File)) {
      return NextResponse.json({ error: 'Carica la certificazione DID.' }, { status: 422 });
    }

    const allowedExtensions = ['pdf', 'png', 'jpg', 'jpeg', 'zip'];
    const filesToValidate = [
      idDocument,
      taxCodeDocument,
      didDocument,
      ...quotes.filter((q) => q instanceof File)
    ] as File[];

    for (const file of filesToValidate) {
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (!extension || !allowedExtensions.includes(extension)) {
        return NextResponse.json(
          { error: 'Formato file non consentito. Ammessi PDF, PNG, JPG, ZIP.' },
          { status: 422 }
        );
      }
      if (file.size > 25 * 1024 * 1024) {
        return NextResponse.json({ error: 'File troppo grande. Max 25MB.' }, { status: 422 });
      }
    }

    // Determine email and Stripe metadata (best effort).
    let normalizedEmail = providedEmail ? providedEmail.toLowerCase() : '';
    let checkoutSessionId: string | null = null;
    let stripeCustomerId: string | null = null;
    let stripePaymentIntentId: string | null = null;
    let currency: string | null = null;
    let amountPaid = 0;

    if (providedSessionId) {
      try {
        const stripe = getStripeClient();
        const session = await stripe.checkout.sessions.retrieve(providedSessionId);
        if (session.payment_status && session.payment_status !== 'paid') {
          return NextResponse.json({ error: 'Pagamento non completato.' }, { status: 403 });
        }
        checkoutSessionId = session.id;
        stripeCustomerId = typeof session.customer === 'string' ? session.customer : null;
        stripePaymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null;
        currency = session.currency ?? null;
        amountPaid = moneyFromStripe(session.amount_total, session.currency) ?? 0;

        const stripeEmail = session.customer_details?.email ?? session.customer_email ?? null;
        if (stripeEmail) normalizedEmail = stripeEmail.toLowerCase();
      } catch {
        // Ignore Stripe errors and proceed with manual flow.
      }
    }

    if (!normalizedEmail) {
      return NextResponse.json({ error: 'Inserisci una email valida.' }, { status: 422 });
    }
    const { data: quiz } = await supabaseAdmin
      .from('quiz_submissions')
      .select('id, full_name, phone, region, bando_type, eligibility, created_at')
      .eq('email', normalizedEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Quiz is optional: onboarding can be used as a manual link to collect documents and create access.
    // If present, use it to infer practice; otherwise use practiceType from URL/form if provided, else default.
    const practiceType: PracticeType =
      (parsed.data.practiceType as PracticeType | null | undefined) ??
      practiceTypeFromQuiz(quiz?.bando_type) ??
      'resto_sud_2_0';
    const displayName =
      quiz?.full_name?.trim() ||
      normalizedEmail.split('@')[0]?.replace(/[._-]+/g, ' ')?.trim() ||
      'Cliente BNDO';

    const effectiveCheckoutSessionId = checkoutSessionId ?? `manual_${randomUUID()}`;

    const quoteFiles = quotes.filter((q) => q instanceof File) as File[];
    const quotesText = parsed.data.quotesText?.trim() ?? '';
    if (!quoteFiles.length && !quotesText) {
      return NextResponse.json(
        { error: 'Carica almeno un preventivo oppure inserisci bene/servizio + prezzo + IVA.' },
        { status: 422 }
      );
    }

    const provision = await provisionAccountFromCheckout({
      checkoutSessionId: effectiveCheckoutSessionId,
      customerEmail: normalizedEmail,
      companyName: displayName,
      contactName: displayName,
      stripeCustomerId,
      stripePaymentIntentId
    });

    const companyId = provision.companyId;
    let userId = provision.userId;

    if (!companyId) {
      return NextResponse.json({ error: 'Provisioning incompleto (companyId mancante).' }, { status: 500 });
    }

    if (!userId) {
      const { data: profileByEmail } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle();
      userId = profileByEmail?.id ?? null;
    }

    if (!userId) {
      return NextResponse.json({ error: 'Provisioning incompleto (userId mancante).' }, { status: 500 });
    }

    const { applicationId } = await ensureBandoApplication(supabaseAdmin, companyId, practiceType);

    const consentSnapshot = {
      privacy_accepted: true,
      terms_accepted: true,
      data_and_documents_storage_authorized: true,
      legal_version: LEGAL_LAST_UPDATED,
      captured_at: new Date().toISOString(),
      ip_address: ipAddress,
      user_agent: userAgent ?? null
    };

    // Persist legal consent evidence (best-effort fallback when table isn't deployed yet).
    let legalStored = false;
    try {
      const { error: legalErr } = await supabaseAdmin.from('legal_consents').upsert(
        {
          context: 'after_payment_onboarding',
          email: normalizedEmail,
          company_id: companyId,
          user_id: userId,
          application_id: applicationId,
          checkout_session_id: effectiveCheckoutSessionId,
          quiz_submission_id: quiz?.id ?? null,
          consents: consentSnapshot as unknown as Json,
          ip_address: ipAddress,
          user_agent: userAgent ?? null
        },
        { onConflict: 'context,checkout_session_id' }
      );
      if (!legalErr) {
        legalStored = true;
      } else if ((legalErr as { code?: string })?.code !== '42P01') {
        // Unexpected error: keep going only if we can store a consent fallback in CRM.
        legalStored = false;
      }
    } catch {
      legalStored = false;
    }

    // Update CRM fields (used in Admin "Scheda cliente").
    const { data: existingCrm } = await supabaseAdmin
      .from('company_crm')
      .select('admin_fields')
      .eq('company_id', companyId)
      .maybeSingle();

    const currentFields = (existingCrm?.admin_fields ?? {}) as Record<string, unknown>;
    const currentLegalConsents = Array.isArray(currentFields.legal_consents) ? (currentFields.legal_consents as unknown[]) : [];
    const nextLegalConsents = [
      {
        context: 'after_payment_onboarding',
        session_id: effectiveCheckoutSessionId,
        quiz_id: quiz?.id ?? null,
        legal_version: LEGAL_LAST_UPDATED,
        captured_at: new Date().toISOString(),
        ip_address: ipAddress,
        user_agent: userAgent ?? null
      },
      ...currentLegalConsents
    ].slice(0, 20);
    const nextFields: Record<string, unknown> = {
      ...currentFields,
      phone: quiz?.phone ?? currentFields.phone ?? '',
      pec: parsed.data.pec.trim(),
      project_summary: parsed.data.projectSummary?.trim() || (currentFields.project_summary as string | undefined) || '',
      firma_digitale:
        parsed.data.digitalSignature === 'yes'
          ? 'si'
          : parsed.data.digitalSignature === 'no'
            ? 'no'
            : (currentFields.firma_digitale as string | undefined) || '',
      certificazione_did: 'si',
      preventivi_testo: quotesText || (currentFields.preventivi_testo as string | undefined) || '',
      onboarding_completed_at: new Date().toISOString(),
      legal_consents: nextLegalConsents,
      legal: {
        ...(typeof currentFields.legal === 'object' && currentFields.legal && !Array.isArray(currentFields.legal) ? (currentFields.legal as Record<string, unknown>) : {}),
        after_payment_onboarding: consentSnapshot
      }
    };

    // Initialize billing state for this practice (500 total, paid = Stripe amount).
    const currentBilling = (nextFields.billing as Record<string, unknown> | undefined) ?? null;
    const currentPayments =
      currentBilling && typeof currentBilling === 'object' && !Array.isArray(currentBilling)
        ? ((currentBilling.payments as Record<string, { total: number; paid: number }> | undefined) ?? {})
        : {};
    const currentInvoices =
      currentBilling && typeof currentBilling === 'object' && !Array.isArray(currentBilling)
        ? (((currentBilling.invoices as Array<unknown> | undefined) ?? []) as Array<unknown>)
        : [];

    const nextPayments = {
      ...currentPayments,
      [applicationId]: {
        total: 500,
        paid: Math.max(0, Math.min(500, Number.isFinite(amountPaid) ? amountPaid : 0))
      }
    };

    nextFields.billing = {
      payments: nextPayments,
      invoices: currentInvoices
    };

    const { error: crmErr } = await supabaseAdmin.from('company_crm').upsert(
      {
        company_id: companyId,
        admin_fields: nextFields as unknown as Json,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'company_id' }
    );
    const crmStored = !crmErr;

    // If the dedicated table isn't available, at least ensure we stored a fallback record in CRM.
    if (!legalStored && !crmStored) {
      return NextResponse.json(
        { error: 'Impossibile salvare i consensi legali. Contatta il supporto e riprova.' },
        { status: 500 }
      );
    }

    // Upload base documents and create DB records.
    const baseDocs: Array<{ label: string; file: File }> = [
      { label: 'Documento di riconoscimento', file: idDocument },
      { label: 'Codice fiscale', file: taxCodeDocument },
      { label: 'Certificazione DID', file: didDocument }
    ];

    for (const doc of baseDocs) {
      const timestamp = Date.now();
      const safeOriginal = safeFileName(doc.file.name);
      const safeLabel = safeFileName(doc.label).slice(0, 80);
      const fileName = `${safeLabel}__${safeOriginal}`;
      const storagePath = `${companyId}/${applicationId}/${timestamp}_${fileName}`;
      const fileBuffer = Buffer.from(await doc.file.arrayBuffer());

      const { error: storageError } = await supabaseAdmin.storage
        .from('application-documents')
        .upload(storagePath, fileBuffer, {
          contentType: doc.file.type || 'application/octet-stream',
          upsert: false
        });

      if (storageError) {
        return NextResponse.json({ error: `Upload storage fallito: ${storageError.message}` }, { status: 500 });
      }

      const { error: docError } = await supabaseAdmin.from('application_documents').insert({
        application_id: applicationId,
        uploaded_by: userId,
        file_name: fileName,
        storage_path: storagePath,
        file_size: doc.file.size,
        mime_type: doc.file.type || 'application/octet-stream'
      });

      if (docError) {
        return NextResponse.json({ error: `Inserimento documento fallito: ${docError.message}` }, { status: 500 });
      }
    }

    for (const file of quoteFiles) {
      const timestamp = Date.now();
      const safeOriginal = safeFileName(file.name);
      const fileName = `Preventivo_spesa__${safeOriginal}`;
      const storagePath = `${companyId}/${applicationId}/${timestamp}_${fileName}`;
      const fileBuffer = Buffer.from(await file.arrayBuffer());

      const { error: storageError } = await supabaseAdmin.storage
        .from('application-documents')
        .upload(storagePath, fileBuffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: false
        });

      if (storageError) {
        return NextResponse.json({ error: `Upload storage fallito: ${storageError.message}` }, { status: 500 });
      }

      const { error: docError } = await supabaseAdmin.from('application_documents').insert({
        application_id: applicationId,
        uploaded_by: userId,
        file_name: fileName,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.type || 'application/octet-stream'
      });

      if (docError) {
        return NextResponse.json({ error: `Inserimento documento fallito: ${docError.message}` }, { status: 500 });
      }
    }

    // Create chat thread and notify admin via message.
    const { data: ensuredThread } = await supabaseAdmin
      .from('consultant_threads')
      .upsert({ company_id: companyId }, { onConflict: 'company_id' })
      .select('id')
      .single();

    const threadId = ensuredThread?.id ?? null;
    if (threadId) {
      await supabaseAdmin.from('consultant_thread_participants').upsert(
        {
          thread_id: threadId,
          profile_id: userId,
          participant_role: 'client_admin',
          last_read_at: new Date().toISOString()
        },
        { onConflict: 'thread_id,profile_id' }
      );

      const practiceLabel = practiceTitle(practiceType);
      const lines = [
        '[AVVIO PRATICA]',
        `Pratica: ${practiceLabel}`,
        `Pagamento anticipo: ${amountPaid ? `${amountPaid} ${String(currency ?? '').toUpperCase()}` : 'OK'}`,
        `Documenti caricati: Documento di riconoscimento, Codice fiscale, Certificazione DID${quoteFiles.length ? `, Preventivi (${quoteFiles.length})` : ''}`,
        `PEC: ${parsed.data.pec}`,
        `Firma digitale: ${parsed.data.digitalSignature === 'yes' ? 'Si' : 'No'}`,
        quotesText ? `Preventivi (testo):\n${quotesText}` : null,
        parsed.data.projectSummary ? `Sintesi progetto: ${parsed.data.projectSummary}` : null
      ].filter(Boolean) as string[];

      await supabaseAdmin.from('consultant_messages').insert({
        thread_id: threadId,
        sender_profile_id: userId,
        body: lines.join('\n')
      });

      // Ensure at least one ops user is in the thread and sends an auto-reply.
      await ensureOpsAutoReply(threadId);
    }

    // Ensure practice progress marker (payment/mandate activated).
    const { data: appRow } = await supabaseAdmin
      .from('tender_applications')
      .select('id, notes')
      .eq('id', applicationId)
      .maybeSingle();

    const baseNote = 'Pagamento anticipo completato. Documenti base caricati. In attesa documenti integrativi.';
    const nextNotes = upsertProgressIntoNotes([appRow?.notes ?? '', baseNote].filter(Boolean).join('\n'), 'contract_active');

    await supabaseAdmin.from('tender_applications').update({ notes: nextNotes }).eq('id', applicationId);

    // Store a lead entry (useful for ops tracking).
    await supabaseAdmin.from('leads').insert({
      full_name: displayName,
      email: normalizedEmail,
      company_name: displayName,
      phone: quiz?.phone ?? null,
      challenge: `Pagamento anticipo + onboarding base docs | Pratica: ${practiceTitle(practiceType)} | Quiz: ${quiz?.id ?? 'N/D'}`
    });

    return NextResponse.json(
      {
        ok: true,
        sessionId: effectiveCheckoutSessionId,
        companyId,
        userId,
        applicationId,
        practiceType,
        alreadyProvisioned: provision.alreadyProvisioned
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json({ error: publicError(error, 'Errore onboarding. Riprova tra qualche secondo.') }, { status: 500 });
  }
}
