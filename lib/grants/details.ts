import { buildFallbackGrantDetail, buildFallbackGrantExplainability, isGrantNotFoundError } from '@/lib/grantDetailFallback';
import { fetchJsonWithTimeout, loginScannerApi, scannerApiUrl } from '@/lib/scannerApiClient';

const DETAIL_TIMEOUT_MS = Number.parseInt(process.env.SCANNER_GRANT_DETAIL_TIMEOUT_MS || '6500', 10);
const DETAIL_RETRY_ATTEMPTS = Number.parseInt(process.env.SCANNER_GRANT_DETAIL_RETRY_ATTEMPTS || '2', 10);

export type GrantDetailRecord = {
  id: string;
  title: string;
  authority: string | null;
  openingDate: string | null;
  deadlineDate: string | null;
  availabilityStatus: 'open' | 'incoming';
  budgetTotal: number | null;
  aidForm: string | null;
  aidIntensity: string | null;
  beneficiaries: string[];
  sectors: string[];
  officialUrl: string;
  officialAttachments: string[];
  description: string | null;
  cpvCode?: string | null;
  requisitiHard: Record<string, unknown>;
  requisitiSoft: Record<string, unknown>;
  requisitiStrutturati: Record<string, unknown>;
  requiredDocuments?: string[];
};


export type GrantExplainabilityRecord = {
  hardStatus: 'eligible' | 'not_eligible' | 'unknown';
  eligibilityScore: number;
  completenessScore: number;
  fitScore: number;
  probabilityScore: number;
  whyFit: string[];
  satisfiedRequirements: string[];
  missingRequirements: string[];
  applySteps: string[];
  message?: string;
};

async function fetchFromScanner<T>(path: string): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= Math.max(1, DETAIL_RETRY_ATTEMPTS); attempt += 1) {
    try {
      const token = await loginScannerApi(DETAIL_TIMEOUT_MS);
      return await fetchJsonWithTimeout<T>(
        scannerApiUrl(path),
        {
          method: 'GET',
          headers: { authorization: `Bearer ${token}` }
        },
        DETAIL_TIMEOUT_MS
      );
    } catch (error) {
      lastError = error;
      if (attempt < Math.max(1, DETAIL_RETRY_ATTEMPTS)) {
        await new Promise((resolve) => setTimeout(resolve, 220 * attempt));
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Errore caricamento dati bando.');
}

export async function fetchGrantDetail(grantId: string): Promise<GrantDetailRecord> {
  const id = String(grantId || '').trim();
  if (!id) {
    throw new Error('ID bando mancante.');
  }

  try {
    return await fetchFromScanner<GrantDetailRecord>(`/api/v1/grants/${encodeURIComponent(id)}`);
  } catch (error) {
    try {
      return await buildFallbackGrantDetail(id);
    } catch (fallbackError) {
      if (isGrantNotFoundError(fallbackError)) {
        throw new Error('Bando non trovato.');
      }
      throw fallbackError instanceof Error
        ? fallbackError
        : error instanceof Error
          ? error
          : new Error('Errore caricamento bando.');
    }
  }
}

export async function fetchGrantExplainability(grantId: string): Promise<GrantExplainabilityRecord> {
  const id = String(grantId || '').trim();
  if (!id) {
    throw new Error('ID bando mancante.');
  }

  try {
    return await fetchFromScanner<GrantExplainabilityRecord>(`/api/v1/grants/${encodeURIComponent(id)}/explainability`);
  } catch (error) {
    try {
      return await buildFallbackGrantExplainability(id);
    } catch (fallbackError) {
      if (isGrantNotFoundError(fallbackError)) {
        throw new Error('Bando non trovato.');
      }
      throw fallbackError instanceof Error
        ? fallbackError
        : error instanceof Error
          ? error
          : new Error('Errore caricamento explainability.');
    }
  }
}
