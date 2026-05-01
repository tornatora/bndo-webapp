import type { ClientData, FlowStep, FlowTemplate } from './types';

const DEFAULT_LINEA_INTERVENTO = 'Capo IV - Resto al Sud 2.0';
const DEFAULT_TIPOLOGIA_PROPONENTE = 'Voucher Lavoratore autonomo-libero professionista';
const CORPORATE_TIPOLOGIA_PROPONENTE = 'Voucher Società e ditte individuali';

const CORPORATE_FORM_KEYS = [
  'societa',
  'società',
  's.r.l',
  'srl',
  's.p.a',
  'spa',
  's.n.c',
  'snc',
  's.a.s',
  'sas',
  'cooperativa',
  'ditta individuale',
];

const WAIT_UNTIL_ALLOWED = new Set(['load', 'domcontentloaded', 'networkidle', 'commit']);

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getBoundValue(valueFrom: string | undefined, fieldMapping: Record<string, string>, client: ClientData): string {
  if (!valueFrom) return '';
  if (valueFrom.startsWith('recorded.')) return fieldMapping[valueFrom] || '';
  if (valueFrom.startsWith('client.')) {
    const key = valueFrom.replace('client.', '') as keyof ClientData;
    return String(client[key] || '');
  }
  return valueFrom;
}

export function resolveTipologiaProponente(formaGiuridica: string, fallback?: string): string {
  const normalized = normalizeText(formaGiuridica || '');
  if (normalized && CORPORATE_FORM_KEYS.some((key) => normalized.includes(key))) {
    return CORPORATE_TIPOLOGIA_PROPONENTE;
  }
  return fallback?.trim() || DEFAULT_TIPOLOGIA_PROPONENTE;
}

export function resolveFlowStepValue(step: FlowStep, flowTemplate: FlowTemplate, client: ClientData): string {
  const targetId = step.target?.id || '';
  const bound = getBoundValue(step.valueFrom, flowTemplate.fieldMapping, client);

  if (targetId === 'lineaIntervento') {
    return DEFAULT_LINEA_INTERVENTO;
  }
  if (targetId === 'tipologiaProponente') {
    return resolveTipologiaProponente(
      client.formaGiuridica,
      process.env.COMPILA_BANDO_DEFAULT_TIPOLOGIA_PROPONENTE
    );
  }
  if (targetId === 'Nome') {
    return client.firstName || client.fullName.split(' ')[0] || bound;
  }
  if (targetId === 'Cognome') {
    const fromClient = client.lastName || client.fullName.split(' ').slice(1).join(' ');
    return fromClient || bound;
  }

  return bound;
}

function escapeForSelector(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function pushCandidate(list: string[], candidate: string | undefined) {
  const normalized = (candidate || '').trim();
  if (!normalized || list.includes(normalized)) return;
  list.push(normalized);
}

export function getFlowStepSelectorCandidates(step: FlowStep): string[] {
  const t = step.target;
  if (!t) return [];

  const candidates: string[] = [];
  const escapedText = t.text ? escapeForSelector(t.text) : '';
  const escapedLabel = t.label ? escapeForSelector(t.label) : '';
  const escapedPlaceholder = t.placeholder ? escapeForSelector(t.placeholder) : '';

  const isClick = step.type === 'click';
  const clickNameRaw = (t.text || t.label || '').trim();
  const escapedClickName = clickNameRaw ? escapeForSelector(clickNameRaw) : '';

  pushCandidate(candidates, t.css);
  if (t.id) pushCandidate(candidates, `#${t.id}`);
  if (t.name) pushCandidate(candidates, `[name="${escapeForSelector(t.name)}"]`);
  if (t.testId) pushCandidate(candidates, `[data-testid="${escapeForSelector(t.testId)}"]`);
  if (t.placeholder) pushCandidate(candidates, `[placeholder="${escapedPlaceholder}"]`);
  if (t.role && t.text) pushCandidate(candidates, `[role="${escapeForSelector(t.role)}"]:has-text("${escapedText}")`);
  if (t.tag && t.text) pushCandidate(candidates, `${t.tag}:has-text("${escapedText}")`);
  // For click steps, `label` often comes from DevTools ARIA locators, not an HTML <label>.
  // We handle those via click-specific candidates below, so avoid wasting priority on label+input patterns.
  if (t.label && !isClick) {
    pushCandidate(candidates, `label:has-text("${escapedLabel}")`);
    pushCandidate(candidates, `label:has-text("${escapedLabel}") + input`);
    pushCandidate(candidates, `label:has-text("${escapedLabel}") + select`);
  }
  if (t.text) pushCandidate(candidates, `text="${escapedText}"`);

  // Click steps often come from DevTools "aria" locators (stored as label) or plain innerText.
  // Prefer clickable elements first, then fall back to generic text matching.
  if (isClick && escapedClickName) {
    pushCandidate(candidates, `button:has-text("${escapedClickName}")`);
    pushCandidate(candidates, `a:has-text("${escapedClickName}")`);
    pushCandidate(candidates, `[role="button"]:has-text("${escapedClickName}")`);
    pushCandidate(candidates, `[role="link"]:has-text("${escapedClickName}")`);
    pushCandidate(candidates, `mat-option:has-text("${escapedClickName}")`);
    pushCandidate(candidates, `[role="option"]:has-text("${escapedClickName}")`);
    // Last resort: any element containing the text.
    pushCandidate(candidates, `text="${escapedClickName}"`);
  }
  // Intentionally DO NOT push plain tag selectors (e.g. "div", "input"):
  // they're too broad and can cause random clicks if more specific selectors fail.

  const xpath = t.xpath?.trim();
  if (xpath) {
    if (xpath.startsWith('xpath=')) {
      pushCandidate(candidates, xpath);
    } else if (xpath.startsWith('//') || xpath.startsWith('/')) {
      pushCandidate(candidates, `xpath=${xpath}`);
    }
  }

  return candidates;
}

export function resolveWaitUntil(raw: string | undefined): 'load' | 'domcontentloaded' | 'networkidle' | 'commit' {
  const normalized = (raw || 'domcontentloaded').toLowerCase();
  // For third-party portals, "load" can be very slow and not necessary.
  // We settle after action anyway, so prefer domcontentloaded.
  if (normalized === 'load') return 'domcontentloaded';
  if (WAIT_UNTIL_ALLOWED.has(normalized)) return normalized as 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
  return 'domcontentloaded';
}

export function buildStrictExecutionQueue(flowTemplate: FlowTemplate): Array<{ stepIndex: number; step: FlowStep }> {
  return flowTemplate.steps.map((step, stepIndex) => ({ stepIndex, step }));
}
