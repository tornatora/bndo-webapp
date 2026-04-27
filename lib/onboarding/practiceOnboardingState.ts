import type { Json } from '@/lib/supabase/database.types';

export type OnboardingSnapshotAction = 'save_progress' | 'complete' | 'edit_fields';
export type OnboardingSnapshotStatus = 'draft' | 'completed';

export type OnboardingBusinessFields = {
  pec: string;
  digitalSignature: 'yes' | 'no' | '';
  quotesText: string;
};

export type OnboardingDocumentRef = {
  id: string;
  fileName: string;
  requirementKey: string | null;
  createdAt: string;
  source: 'save_progress' | 'complete';
};

export type OnboardingHistoryEntry = {
  at: string;
  action: OnboardingSnapshotAction;
  actorProfileId: string | null;
  actorRole: string | null;
  changes: Record<string, unknown>;
};

export type OnboardingApplicationState = {
  applicationId: string;
  practiceType: string | null;
  grantSlug: string | null;
  sourceChannel: string | null;
  status: OnboardingSnapshotStatus;
  currentStep: number | null;
  completedSteps: number[];
  fields: OnboardingBusinessFields;
  onboardingDocumentIds: string[];
  onboardingDocuments: OnboardingDocumentRef[];
  updatedAt: string;
  completedAt: string | null;
  history: OnboardingHistoryEntry[];
};

const ONBOARDING_BY_APPLICATION_KEY = 'onboarding_by_application';
const LEGACY_DRAFTS_KEY = 'onboarding_drafts';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, maxLen = 4000): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLen) return normalized;
  return normalized.slice(0, maxLen);
}

function nullableStringValue(value: unknown, maxLen = 160): string | null {
  const normalized = stringValue(value, maxLen);
  return normalized || null;
}

function normalizeDigitalSignature(value: unknown): 'yes' | 'no' | '' {
  const token = stringValue(value, 12).toLowerCase();
  if (token === 'yes' || token === 'si') return 'yes';
  if (token === 'no') return 'no';
  return '';
}

function normalizeStep(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < 1 || parsed > 7) return null;
  return parsed;
}

function normalizeCompletedSteps(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const set = new Set<number>();
  for (const item of value) {
    const parsed = Number(item);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 7) continue;
    set.add(parsed);
  }
  return Array.from(set.values()).sort((a, b) => a - b);
}

function toIso(value: unknown, fallback: string): string {
  const maybe = String(value ?? '').trim();
  if (!maybe) return fallback;
  const date = new Date(maybe);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString();
}

function normalizeDocumentRef(value: unknown): OnboardingDocumentRef | null {
  const record = asRecord(value);
  const id = stringValue(record.id, 220);
  const fileName = stringValue(record.file_name ?? record.fileName, 260);
  if (!id || !fileName) return null;

  const sourceToken = stringValue(record.source, 24).toLowerCase();
  const source: 'save_progress' | 'complete' = sourceToken === 'save_progress' ? 'save_progress' : 'complete';

  return {
    id,
    fileName,
    requirementKey: nullableStringValue(record.requirement_key ?? record.requirementKey, 140),
    createdAt: toIso(record.created_at ?? record.createdAt, new Date().toISOString()),
    source
  };
}

function normalizeHistoryEntry(value: unknown): OnboardingHistoryEntry | null {
  const record = asRecord(value);
  const actionToken = stringValue(record.action, 40).toLowerCase();
  const action: OnboardingSnapshotAction =
    actionToken === 'save_progress' || actionToken === 'complete' || actionToken === 'edit_fields'
      ? (actionToken as OnboardingSnapshotAction)
      : 'edit_fields';

  const changes = asRecord(record.changes);

  return {
    at: toIso(record.at, new Date().toISOString()),
    action,
    actorProfileId: nullableStringValue(record.actor_profile_id ?? record.actorProfileId, 80),
    actorRole: nullableStringValue(record.actor_role ?? record.actorRole, 80),
    changes
  };
}

function normalizeApplicationState(value: unknown, fallbackApplicationId: string): OnboardingApplicationState | null {
  const record = asRecord(value);
  const applicationId = stringValue(record.application_id ?? record.applicationId, 80) || fallbackApplicationId;
  if (!applicationId) return null;

  const statusToken = stringValue(record.status, 20).toLowerCase();
  const status: OnboardingSnapshotStatus = statusToken === 'completed' ? 'completed' : 'draft';

  const fieldsRecord = asRecord(record.fields);
  const fields: OnboardingBusinessFields = {
    pec: stringValue(fieldsRecord.pec, 160),
    digitalSignature: normalizeDigitalSignature(fieldsRecord.digital_signature ?? fieldsRecord.digitalSignature),
    quotesText: stringValue(fieldsRecord.quotes_text ?? fieldsRecord.quotesText, 2500)
  };

  const onboardingDocuments = Array.isArray(record.onboarding_documents)
    ? (record.onboarding_documents as unknown[])
        .map((entry) => normalizeDocumentRef(entry))
        .filter((entry): entry is OnboardingDocumentRef => Boolean(entry))
        .slice(0, 60)
    : [];

  const onboardingDocumentIdsSet = new Set<string>(
    onboardingDocuments
      .map((entry) => entry.id)
      .filter(Boolean)
  );

  if (Array.isArray(record.onboarding_document_ids)) {
    for (const item of record.onboarding_document_ids) {
      const id = stringValue(item, 220);
      if (id) onboardingDocumentIdsSet.add(id);
    }
  }

  const history = Array.isArray(record.history)
    ? (record.history as unknown[])
        .map((entry) => normalizeHistoryEntry(entry))
        .filter((entry): entry is OnboardingHistoryEntry => Boolean(entry))
        .slice(0, 60)
    : [];

  return {
    applicationId,
    practiceType: nullableStringValue(record.practice_type ?? record.practiceType, 80),
    grantSlug: nullableStringValue(record.grant_slug ?? record.grantSlug, 160),
    sourceChannel: nullableStringValue(record.source_channel ?? record.sourceChannel, 80),
    status,
    currentStep: normalizeStep(record.current_step ?? record.currentStep),
    completedSteps: normalizeCompletedSteps(record.completed_steps ?? record.completedSteps),
    fields,
    onboardingDocumentIds: Array.from(onboardingDocumentIdsSet.values()).slice(0, 120),
    onboardingDocuments,
    updatedAt: toIso(record.updated_at ?? record.updatedAt, new Date().toISOString()),
    completedAt: status === 'completed' ? toIso(record.completed_at ?? record.completedAt, new Date().toISOString()) : null,
    history
  };
}

export function readOnboardingApplicationMap(adminFields: Record<string, unknown> | null | undefined) {
  const fields = asRecord(adminFields);
  const root = asRecord(fields[ONBOARDING_BY_APPLICATION_KEY]);
  const normalized: Record<string, OnboardingApplicationState> = {};

  for (const [applicationId, candidate] of Object.entries(root)) {
    const state = normalizeApplicationState(candidate, applicationId);
    if (!state) continue;
    normalized[state.applicationId] = state;
  }

  return normalized;
}

export function getOnboardingApplicationState(args: {
  adminFields: Record<string, unknown> | null | undefined;
  applicationId: string;
}) {
  const normalizedApplicationId = stringValue(args.applicationId, 80);
  if (!normalizedApplicationId) return null;
  const map = readOnboardingApplicationMap(args.adminFields);
  return map[normalizedApplicationId] ?? null;
}

export type LegacyOnboardingDraft = {
  applicationId: string;
  savedAt: string;
  currentStep: number | null;
  completedSteps: number[];
  pec: string;
  digitalSignature: 'yes' | 'no' | '';
  quotesText: string;
};

export function readLegacyOnboardingDraft(args: {
  adminFields: Record<string, unknown> | null | undefined;
  applicationId: string;
}): LegacyOnboardingDraft | null {
  const fields = asRecord(args.adminFields);
  const draftsRoot = asRecord(fields[LEGACY_DRAFTS_KEY]);
  const draftRaw = asRecord(draftsRoot[args.applicationId]);
  if (Object.keys(draftRaw).length === 0) return null;

  return {
    applicationId: stringValue(draftRaw.application_id ?? args.applicationId, 80) || args.applicationId,
    savedAt: toIso(draftRaw.saved_at, new Date().toISOString()),
    currentStep: normalizeStep(draftRaw.current_step),
    completedSteps: normalizeCompletedSteps(draftRaw.completed_steps),
    pec: stringValue(draftRaw.pec, 160),
    digitalSignature: normalizeDigitalSignature(draftRaw.digital_signature),
    quotesText: stringValue(draftRaw.quotes_text, 2500)
  };
}

function mergeDocuments(existing: OnboardingDocumentRef[], incoming: OnboardingDocumentRef[]) {
  const byId = new Map<string, OnboardingDocumentRef>();
  for (const doc of [...incoming, ...existing]) {
    if (!doc.id) continue;
    byId.set(doc.id, doc);
  }
  return Array.from(byId.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 60);
}

export function upsertOnboardingApplicationState(args: {
  adminFields: Record<string, unknown> | null | undefined;
  applicationId: string;
  action: OnboardingSnapshotAction;
  actorProfileId?: string | null;
  actorRole?: string | null;
  status?: OnboardingSnapshotStatus;
  practiceType?: string | null;
  grantSlug?: string | null;
  sourceChannel?: string | null;
  currentStep?: number | null;
  completedSteps?: number[];
  fieldPatch?: Partial<OnboardingBusinessFields>;
  documents?: OnboardingDocumentRef[];
  extraChanges?: Record<string, unknown>;
}) {
  const nowIso = new Date().toISOString();
  const applicationId = stringValue(args.applicationId, 80);
  if (!applicationId) {
    throw new Error('applicationId mancante per snapshot onboarding');
  }

  const fields = asRecord(args.adminFields);
  const map = readOnboardingApplicationMap(fields);
  const existing = map[applicationId] ?? null;

  const baseFields: OnboardingBusinessFields = {
    pec: existing?.fields.pec ?? '',
    digitalSignature: existing?.fields.digitalSignature ?? '',
    quotesText: existing?.fields.quotesText ?? ''
  };

  const nextFields: OnboardingBusinessFields = {
    pec:
      args.fieldPatch && Object.prototype.hasOwnProperty.call(args.fieldPatch, 'pec')
        ? stringValue(args.fieldPatch.pec, 160)
        : baseFields.pec,
    digitalSignature:
      args.fieldPatch && Object.prototype.hasOwnProperty.call(args.fieldPatch, 'digitalSignature')
        ? normalizeDigitalSignature(args.fieldPatch.digitalSignature)
        : baseFields.digitalSignature,
    quotesText:
      args.fieldPatch && Object.prototype.hasOwnProperty.call(args.fieldPatch, 'quotesText')
        ? stringValue(args.fieldPatch.quotesText, 2500)
        : baseFields.quotesText
  };

  const incomingDocuments = (args.documents ?? [])
    .map((entry) => normalizeDocumentRef(entry))
    .filter((entry): entry is OnboardingDocumentRef => Boolean(entry));

  const mergedDocuments = mergeDocuments(existing?.onboardingDocuments ?? [], incomingDocuments);
  const onboardingDocumentIds = Array.from(
    new Set([
      ...(existing?.onboardingDocumentIds ?? []),
      ...mergedDocuments.map((entry) => entry.id),
      ...incomingDocuments.map((entry) => entry.id)
    ])
  ).slice(0, 120);

  const status = args.status ?? existing?.status ?? 'draft';
  const currentStep = args.currentStep === undefined ? existing?.currentStep ?? null : normalizeStep(args.currentStep);
  const completedSteps =
    args.completedSteps === undefined ? existing?.completedSteps ?? [] : normalizeCompletedSteps(args.completedSteps);

  const changes: Record<string, unknown> = {
    ...(args.extraChanges ?? {}),
    status,
    currentStep,
    completedSteps,
    fields: nextFields,
    addedDocumentIds: incomingDocuments.map((entry) => entry.id)
  };

  const historyEntry: OnboardingHistoryEntry = {
    at: nowIso,
    action: args.action,
    actorProfileId: nullableStringValue(args.actorProfileId, 80),
    actorRole: nullableStringValue(args.actorRole, 80),
    changes
  };

  const nextState: OnboardingApplicationState = {
    applicationId,
    practiceType: nullableStringValue(args.practiceType, 80) ?? existing?.practiceType ?? null,
    grantSlug: nullableStringValue(args.grantSlug, 180) ?? existing?.grantSlug ?? null,
    sourceChannel: nullableStringValue(args.sourceChannel, 80) ?? existing?.sourceChannel ?? null,
    status,
    currentStep,
    completedSteps,
    fields: nextFields,
    onboardingDocumentIds,
    onboardingDocuments: mergedDocuments,
    updatedAt: nowIso,
    completedAt: status === 'completed' ? nowIso : null,
    history: [historyEntry, ...(existing?.history ?? [])].slice(0, 60)
  };

  const nextMap = {
    ...map,
    [applicationId]: nextState
  };

  const nextAdminFields: Record<string, unknown> = {
    ...fields,
    [ONBOARDING_BY_APPLICATION_KEY]: nextMap
  };

  return {
    state: nextState,
    nextAdminFields,
    nextAdminFieldsJson: nextAdminFields as unknown as Json
  };
}

export function removeOnboardingApplicationState(args: {
  adminFields: Record<string, unknown> | null | undefined;
  applicationId: string;
}) {
  const fields = asRecord(args.adminFields);
  const map = readOnboardingApplicationMap(fields);
  const applicationId = stringValue(args.applicationId, 80);
  if (!applicationId || !map[applicationId]) {
    return {
      nextAdminFields: fields,
      nextAdminFieldsJson: fields as unknown as Json
    };
  }

  const nextMap = { ...map };
  delete nextMap[applicationId];

  const legacyDrafts = asRecord(fields[LEGACY_DRAFTS_KEY]);
  if (legacyDrafts[applicationId]) {
    delete legacyDrafts[applicationId];
  }

  const nextAdminFields: Record<string, unknown> = {
    ...fields,
    [ONBOARDING_BY_APPLICATION_KEY]: nextMap,
    [LEGACY_DRAFTS_KEY]: legacyDrafts
  };

  return {
    nextAdminFields,
    nextAdminFieldsJson: nextAdminFields as unknown as Json
  };
}

export const onboardingSnapshotKeys = {
  root: ONBOARDING_BY_APPLICATION_KEY,
  legacyDrafts: LEGACY_DRAFTS_KEY
};
