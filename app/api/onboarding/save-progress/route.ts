import * as crypto from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Json } from '@/lib/supabase/database.types';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  enforceRateLimit,
  getClientIp,
  publicError,
  rejectCrossSiteMutation
} from '@/lib/security/http';

export const runtime = 'nodejs';

const ApplicationIdSchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

const SaveDraftSchema = z.object({
  applicationId: ApplicationIdSchema,
  currentStep: z.coerce.number().int().min(1).max(7).optional(),
  completedSteps: z.string().optional().nullable(),
  pec: z.string().trim().max(160).optional().nullable(),
  digitalSignature: z.enum(['yes', 'no', '']).optional().nullable(),
  quotesText: z.string().trim().max(2000).optional().nullable()
});

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function normalizeRequirementToken(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isDashboardExcludedRequirement(requirementKey: string, label: string) {
  const key = normalizeRequirementToken(requirementKey);
  const normalizedLabel = normalizeRequirementToken(label);
  return key.includes('descrizione_progetto') || normalizedLabel.includes('descrizione_sintetica_del_progetto');
}

function isMissingPracticeRequirementsTableError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string | null; message?: string | null; details?: string | null; hint?: string | null };
  const code = (candidate.code ?? '').toUpperCase();
  if (code === '42P01' || code === 'PGRST205') return true;

  const blob = `${candidate.message ?? ''} ${candidate.details ?? ''} ${candidate.hint ?? ''}`.toLowerCase();
  return (
    blob.includes('practice_document_requirements') &&
    (blob.includes('schema cache') || blob.includes('could not find the table') || blob.includes('does not exist'))
  );
}

function isMissingApplicationDocumentRequirementKeyColumnError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string | null; message?: string | null; details?: string | null; hint?: string | null };
  const code = (candidate.code ?? '').toUpperCase();
  if (code === '42703' || code === 'PGRST204') return true;

  const blob = `${candidate.message ?? ''} ${candidate.details ?? ''} ${candidate.hint ?? ''}`.toLowerCase();
  return (
    blob.includes('application_documents') &&
    blob.includes('requirement_key') &&
    (blob.includes('schema cache') || blob.includes('could not find') || blob.includes('column'))
  );
}

type RequirementRow = {
  requirement_key: string;
  label: string;
  is_required: boolean;
};

function findRequirementByAliases(requirements: RequirementRow[], aliases: string[]) {
  const normalizedAliases = aliases.map((alias) => normalizeRequirementToken(alias));
  return (
    requirements.find((requirement) => {
      const keyToken = normalizeRequirementToken(requirement.requirement_key);
      if (normalizedAliases.includes(keyToken)) return true;
      const labelToken = normalizeRequirementToken(requirement.label);
      return normalizedAliases.some((alias) => labelToken.includes(alias));
    }) ?? null
  );
}

function parseCompletedSteps(raw: string | null | undefined) {
  if (!raw) return [] as number[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [] as number[];
    return parsed
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item >= 1 && item <= 7) as number[];
  } catch {
    return [] as number[];
  }
}

export async function POST(request: Request) {
  try {
    const crossSite = rejectCrossSiteMutation(request);
    if (crossSite) return crossSite;

    const rateLimit = enforceRateLimit({
      namespace: 'onboarding-save-progress',
      key: getClientIp(request),
      limit: 60,
      windowMs: 10 * 60_000
    });
    if (rateLimit) return rateLimit;

    const formData = await request.formData();
    const parsed = SaveDraftSchema.safeParse({
      applicationId: formData.get('applicationId'),
      currentStep: formData.get('currentStep'),
      completedSteps: formData.get('completedSteps'),
      pec: formData.get('pec'),
      digitalSignature: formData.get('digitalSignature'),
      quotesText: formData.get('quotesText')
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dati non validi per salvataggio progressi.' }, { status: 422 });
    }

    const requirementFilesRaw = formData.getAll('requirementFiles');
    const requirementFileKeys = formData.getAll('requirementFileKeys');
    const requirementFileLabels = formData.getAll('requirementFileLabels');
    const quoteFiles = formData.getAll('quotes').filter((entry): entry is File => entry instanceof File);
    const requirementFiles = requirementFilesRaw.filter((entry): entry is File => entry instanceof File);

    // PRE-VALIDATE FILES BEFORE ANY DB MUTATION
    const allowedExtensions = ['pdf', 'png', 'jpg', 'jpeg', 'zip'];
    const filesToValidate = [
      ...requirementFiles,
      ...quoteFiles
    ];
    for (const file of filesToValidate) {
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (!extension || !allowedExtensions.includes(extension)) {
        return NextResponse.json(
          { error: `Formato file "${file.name}" non consentito. Ammessi PDF, PNG, JPG, JPEG, ZIP.` },
          { status: 422 }
        );
      }
      if (file.size > 25 * 1024 * 1024) {
        return NextResponse.json({ error: `Il file "${file.name}" è troppo grande. Dimensione massima 25MB.` }, { status: 422 });
      }
    }

    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Per salvare i progressi devi essere loggato.' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { data: profile } = await admin
      .from('profiles')
      .select('id, role, company_id')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile?.id || profile.role !== 'client_admin' || !profile.company_id) {
      return NextResponse.json({ error: 'Profilo non autorizzato al salvataggio progressi.' }, { status: 403 });
    }

    const { data: application } = await admin
      .from('tender_applications')
      .select('id, company_id, tender_id')
      .eq('id', parsed.data.applicationId)
      .maybeSingle();
    if (!application?.id || application.company_id !== profile.company_id) {
      return NextResponse.json({ error: 'Pratica non trovata o non accessibile.' }, { status: 404 });
    }

    const { data: requirementRows, error: requirementsError } = await admin
      .from('practice_document_requirements')
      .select('requirement_key, label, is_required')
      .eq('application_id', application.id)
      .order('created_at', { ascending: true });

    if (requirementsError && !isMissingPracticeRequirementsTableError(requirementsError)) {
      return NextResponse.json({ error: `Errore caricamento requisiti pratica: ${requirementsError.message}` }, { status: 500 });
    }

    const requirements = (requirementRows ?? []).filter(
      (row) => !isDashboardExcludedRequirement(row.requirement_key, row.label)
    ) as RequirementRow[];

    const quoteRequirement = findRequirementByAliases(requirements, [
      'preventivi_spesa',
      'preventivi',
      'preventivo',
      'quotazione'
    ]);
    const quoteRequirementKey = quoteRequirement?.requirement_key ?? null;

    const uploadedRequirementKeys = new Set<string>();
    const uploadedFileNames: string[] = [];

    const uploadApplicationDocument = async (args: { file: File; label: string; requirementKey: string | null }) => {
      if (args.requirementKey && isDashboardExcludedRequirement(args.requirementKey, args.label)) return null;

      const timestamp = Date.now();
      const safeOriginal = safeFileName(args.file.name);
      const safeLabel = safeFileName(args.label).slice(0, 80) || 'documento';
      const fileName = `${safeLabel}__${safeOriginal}`;
      const storagePath = `${profile.company_id}/${application.id}/${timestamp}_${crypto.randomUUID()}_${fileName}`;
      const fileBuffer = Buffer.from(await args.file.arrayBuffer());

      const { error: storageError } = await admin.storage
        .from('application-documents')
        .upload(storagePath, fileBuffer, {
          contentType: args.file.type || 'application/octet-stream',
          upsert: false
        });
      if (storageError) {
        throw new Error(`Upload storage fallito: ${storageError.message}`);
      }

      const basePayload = {
        application_id: application.id,
        uploaded_by: profile.id,
        file_name: fileName,
        storage_path: storagePath,
        file_size: args.file.size,
        mime_type: args.file.type || 'application/octet-stream'
      };

      const payloadWithRequirement =
        args.requirementKey ? { ...basePayload, requirement_key: args.requirementKey } : basePayload;

      let { error: docError } = await admin.from('application_documents').insert(payloadWithRequirement);
      if (docError && args.requirementKey && isMissingApplicationDocumentRequirementKeyColumnError(docError)) {
        const retry = await admin.from('application_documents').insert(basePayload);
        docError = retry.error;
      }
      if (docError) {
        throw new Error(`Inserimento documento fallito: ${docError.message}`);
      }

      uploadedFileNames.push(args.file.name);
      if (args.requirementKey) uploadedRequirementKeys.add(args.requirementKey);
      return null;
    };

    for (let index = 0; index < requirementFiles.length; index += 1) {
      const rawFile = requirementFiles[index];
      if (!(rawFile instanceof File)) continue;
      const requirementKey = String(requirementFileKeys[index] ?? '').trim();
      const label = String(requirementFileLabels[index] ?? '').trim() || requirementKey || 'Documento';
      if (!requirementKey) continue;
      await uploadApplicationDocument({ file: rawFile, label, requirementKey });
    }

    for (const quoteFile of quoteFiles) {
      await uploadApplicationDocument({
        file: quoteFile,
        label: 'Preventivo spesa',
        requirementKey: quoteRequirementKey
      });
    }

    const removedRequirementKeys = new Set(formData.getAll('removedRequirementKeys').map(String));

    const { data: existingRequirementDocs, error: existingRequirementDocsError } = await admin
      .from('application_documents')
      .select('requirement_key')
      .eq('application_id', application.id);

    const existingUploadedRequirementKeys = new Set(
      (isMissingApplicationDocumentRequirementKeyColumnError(existingRequirementDocsError) ? [] : (existingRequirementDocs ?? []))
        .map((row) => (typeof row.requirement_key === 'string' ? row.requirement_key.trim() : ''))
        .filter((key) => key && !removedRequirementKeys.has(key))
    );

    if (removedRequirementKeys.size > 0) {
      await admin
        .from('application_documents')
        .delete()
        .eq('application_id', application.id)
        .in('requirement_key', Array.from(removedRequirementKeys.values()));
    }

    const mergedUploadedRequirementKeys = new Set([
      ...Array.from(existingUploadedRequirementKeys.values()),
      ...Array.from(uploadedRequirementKeys.values())
    ]);

    if (!isMissingPracticeRequirementsTableError(requirementsError)) {
      if (mergedUploadedRequirementKeys.size > 0) {
        const { error: statusError } = await admin
          .from('practice_document_requirements')
          .update({ status: 'uploaded' })
          .eq('application_id', application.id)
          .in('requirement_key', Array.from(mergedUploadedRequirementKeys.values()));
        if (statusError && !isMissingPracticeRequirementsTableError(statusError)) {
          return NextResponse.json({ error: `Aggiornamento requisiti fallito: ${statusError.message}` }, { status: 500 });
        }
      }

      const trulyMissingKeys = requirements
        .map(r => r.requirement_key)
        .filter(key => !mergedUploadedRequirementKeys.has(key));
      
      if (trulyMissingKeys.length > 0) {
        await admin
          .from('practice_document_requirements')
          .update({ status: 'missing' })
          .eq('application_id', application.id)
          .in('requirement_key', trulyMissingKeys);
      }
    }

    const savedAt = new Date().toISOString();
    const completedSteps = parseCompletedSteps(parsed.data.completedSteps);
    const { data: existingCrm } = await admin
      .from('company_crm')
      .select('admin_fields')
      .eq('company_id', profile.company_id)
      .maybeSingle();

    const currentFields = (existingCrm?.admin_fields ?? {}) as Record<string, unknown>;
    const currentDrafts =
      typeof currentFields.onboarding_drafts === 'object' &&
      currentFields.onboarding_drafts &&
      !Array.isArray(currentFields.onboarding_drafts)
        ? (currentFields.onboarding_drafts as Record<string, unknown>)
        : {};

    const nextDrafts = {
      ...currentDrafts,
      [application.id]: {
        saved_at: savedAt,
        application_id: application.id,
        current_step: parsed.data.currentStep ?? null,
        completed_steps: completedSteps,
        pec: parsed.data.pec?.trim() ?? '',
        digital_signature: parsed.data.digitalSignature ?? '',
        quotes_text: parsed.data.quotesText?.trim() ?? '',
        uploaded_requirement_keys: Array.from(uploadedRequirementKeys.values()),
        uploaded_files: uploadedFileNames
      }
    };

    const nextFields: Record<string, unknown> = {
      ...currentFields,
      onboarding_drafts: nextDrafts
    };

    const { error: crmError } = await admin.from('company_crm').upsert(
      {
        company_id: profile.company_id,
        admin_fields: nextFields as Json,
        updated_at: savedAt
      },
      { onConflict: 'company_id' }
    );
    if (crmError) {
      return NextResponse.json({ error: `Errore salvataggio progressi: ${crmError.message}` }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      savedAt,
      applicationId: application.id,
      uploadedRequirementKeys: Array.from(uploadedRequirementKeys.values()),
      uploadedFilesCount: uploadedFileNames.length
    });
  } catch (error) {
    return NextResponse.json({ error: publicError(error, 'Errore salvataggio progressi onboarding.') }, { status: 500 });
  }
}
