'use client';

export function toSimpleUiError(raw: unknown, fallback = 'Si è verificato un problema. Riprova.') {
  const message = String(raw ?? '').trim();
  const lower = message.toLowerCase();

  if (!message) return fallback;
  if (lower.includes('unauthorized') || lower.includes('forbidden') || lower.includes('accesso')) {
    return 'Accesso non consentito per questa sezione.';
  }
  if (
    lower.includes('does not exist') ||
    lower.includes('schema cache') ||
    lower.includes('relation') ||
    lower.includes('table')
  ) {
    return 'Funzionalità non ancora attiva sul database: aggiorna la pagina tra pochi minuti.';
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('timeout')) {
    return 'Connessione lenta o assente. Controlla internet e riprova.';
  }
  if (lower.includes('invalid') || lower.includes('non valid')) {
    return 'Alcuni dati non sono validi. Controlla i campi e riprova.';
  }
  if (lower.includes('jwt') || lower.includes('token') || lower.includes('session')) {
    return 'Sessione scaduta. Esci e rientra per continuare.';
  }
  return message.length > 220 ? fallback : message;
}

