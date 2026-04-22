/**
 * Regex utili per l'estrazione di dati da visure camerali italiane.
 */

/** Codice fiscale persona fisica: 6 lettere + 2 cifre + 1 lettera + 2 cifre + 1 lettera + 3 cifre + 1 lettera */
export const CF_REGEX = /\b([A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z])\b/gi;

/** Partita IVA italiana: 11 cifre */
export const PIVA_REGEX = /\b(\d{11})\b/g;

/** REA: provincia (2 lettere) + numero */
export const REA_REGEX = /(?:rea|numero\s+rea)\s*[:\-]?\s*([A-Za-z]{2}\s*[\-–—]?\s*\d{4,})/gi;

/** Sede legale: cattura la riga successiva alla keyword */
export const SEDE_LEGALE_REGEX = /(?:sede\s+legale|indirizzo\s+sed[e]?)\s*[:\-]?\s*\n?\s*([^\n]{5,200})/gi;

/** Ragione sociale / Denominazione */
export const RAGIONE_SOCIALE_REGEX = /(?:denominazione|ragione\s+sociale)\s*[:\-]?\s*\n?\s*([^\n]{2,160})/gi;

/** Forma giuridica */
export const FORMA_GIURIDICA_REGEX = /(?:forma\s+giuridica)\s*[:\-]?\s*\n?\s*([^\n]{2,120})/gi;
