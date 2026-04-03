export type ProgressStepKey =
  | 'eligible'
  | 'contract_active'
  | 'docs_collection'
  | 'drafting'
  | 'review'
  | 'submitted';

export const PROGRESS_STEPS: Array<{ key: ProgressStepKey; label: string }> = [
  { key: 'eligible', label: 'Il cliente ha i requisiti per partire' },
  { key: 'contract_active', label: 'Pratica attivata (pagamento/mandato)' },
  { key: 'docs_collection', label: 'Raccolta documenti' },
  { key: 'drafting', label: 'Compilazione domanda' },
  { key: 'review', label: 'Revisione finale' },
  { key: 'submitted', label: 'Pratica inviata' }
];

const NOTE_PREFIX = '[[PROGRESS:';
const NOTE_SUFFIX = ']]';

export function extractProgressFromNotes(notes: string | null | undefined): ProgressStepKey | null {
  if (!notes) return null;
  const start = notes.indexOf(NOTE_PREFIX);
  if (start < 0) return null;
  const end = notes.indexOf(NOTE_SUFFIX, start);
  if (end < 0) return null;
  const raw = notes.slice(start + NOTE_PREFIX.length, end).trim();
  const found = PROGRESS_STEPS.find((s) => s.key === raw);
  return found ? found.key : null;
}

export function upsertProgressIntoNotes(notes: string | null | undefined, step: ProgressStepKey) {
  const marker = `${NOTE_PREFIX}${step}${NOTE_SUFFIX}`;
  const current = notes ?? '';
  const start = current.indexOf(NOTE_PREFIX);
  if (start < 0) {
    return marker + (current ? `\n${current}` : '');
  }
  const end = current.indexOf(NOTE_SUFFIX, start);
  if (end < 0) {
    return marker + (current ? `\n${current}` : '');
  }
  return current.slice(0, start) + marker + current.slice(end + NOTE_SUFFIX.length);
}

export function computeDerivedProgressKey(applicationStatus: string, missingCount: number): ProgressStepKey {
  if (applicationStatus === 'submitted') return 'submitted';
  if (applicationStatus === 'reviewed') return 'review';
  // New practices should start from the activation stage (10%) before
  // moving to document-collection milestones.
  if (missingCount > 0) return 'contract_active';
  return 'drafting';
}

export function progressToApplicationStatus(step: ProgressStepKey): 'draft' | 'reviewed' | 'submitted' {
  if (step === 'submitted') return 'submitted';
  if (step === 'review') return 'reviewed';
  return 'draft';
}

export function progressBadge(step: ProgressStepKey) {
  switch (step) {
    case 'eligible':
      return { label: 'Requisiti OK', className: 'badge badge-info' };
    case 'contract_active':
      return { label: 'Attivata', className: 'badge badge-info' };
    case 'docs_collection':
      return { label: 'Raccolta doc', className: 'badge badge-info' };
    case 'drafting':
      return { label: 'Compilazione', className: 'badge badge-info' };
    case 'review':
      return { label: 'Revisione', className: 'badge badge-info' };
    case 'submitted':
      return { label: 'Inviata', className: 'badge badge-success' };
  }
}

export function computeProgressBar(step: ProgressStepKey) {
  const idx = Math.max(0, PROGRESS_STEPS.findIndex((s) => s.key === step));
  const stepIndex = idx < 0 ? 0 : idx;
  const pctMap: Record<ProgressStepKey, number> = {
    eligible: 10,
    contract_active: 10,
    docs_collection: 35,
    drafting: 60,
    review: 80,
    submitted: 100
  };
  const pct = pctMap[step] ?? 10;
  return { stepIndex, pct };
}
