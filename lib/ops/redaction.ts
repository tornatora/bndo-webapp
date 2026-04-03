import type { Json } from '@/lib/supabase/database.types';

const SECRET_KEY_PATTERN = /(password|pass|token|secret|cookie|authorization|bearer|api[-_]?key)/i;
const PERSONAL_KEY_PATTERN = /(email|pec|phone|telefono|cellulare|address|indirizzo|fiscal|codice[_-]?fiscale|vat|piva)/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const LONG_NUMBER_PATTERN = /\b\d{7,}\b/g;
const TAX_CODE_PATTERN = /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/gi;

function redactString(value: string) {
  return value
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(TAX_CODE_PATTERN, '[redacted-fiscal-code]')
    .replace(LONG_NUMBER_PATTERN, '[redacted-number]');
}

function sanitizeValue(value: Json, depth: number): Json {
  if (depth > 6) return '[redacted-depth-limit]';
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeValue(item as Json, depth + 1));
  }

  const output: Record<string, Json> = {};
  for (const [key, raw] of Object.entries(value ?? {})) {
    if (SECRET_KEY_PATTERN.test(key)) {
      output[key] = '[redacted-secret]';
      continue;
    }
    if (PERSONAL_KEY_PATTERN.test(key) && typeof raw === 'string') {
      output[key] = '[redacted-personal]';
      continue;
    }
    output[key] = sanitizeValue((raw ?? null) as Json, depth + 1);
  }
  return output;
}

export function redactJson(value: Json | undefined | null): Json {
  if (!value) return {};
  return sanitizeValue(value, 0);
}

