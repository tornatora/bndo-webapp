import { buildFallbackGrantDetail, buildFallbackGrantExplainability, isGrantNotFoundError } from '@/lib/grantDetailFallback';
import { fetchJsonWithTimeout, loginScannerApi, scannerApiUrl } from '@/lib/scannerApiClient';

const DETAIL_TIMEOUT_MS = 1_900;

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
  const token = await loginScannerApi(DETAIL_TIMEOUT_MS);
  return fetchJsonWithTimeout<T>(
    scannerApiUrl(path),
    {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` }
    },
    DETAIL_TIMEOUT_MS
  );
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
