import { runUnifiedPipeline } from '../matching/unifiedPipeline';
import { UserFundingProfile } from '../../types/userFundingProfile';
import { normalizeProfile } from '../matching/profileNormalizer';
import { IncentiviDoc } from '../matching/types';

/**
 * Funzione unificata per la ricerca e il calcolo dei matching deterministici
 * dei bandi a partire dal nuovo formato standard \`UserFundingProfile\`.
 */
export async function searchBandiFromProfile(
  profile: UserFundingProfile,
  allActiveGrants: IncentiviDoc[]
) {
  // Convert UserFundingProfile to the legacy UserProfile struct expected by the Normalizer
  const legacyProfile = {
    location: profile.regione ? { region: profile.regione, municipality: profile.comune ?? null } : { region: null, municipality: null },
    sector: profile.settore ?? null,
    ateco: profile.ateco ?? null,
    businessExists: typeof profile.startup === 'boolean' ? !profile.startup : (profile.impresa_gia_costituita ?? null),
    revenueOrBudgetEUR: profile.investimento_previsto ?? null,
    requestedContributionEUR: profile.contributo_richiesto ?? null,
    employees: profile.numero_dipendenti ?? null,
    age: profile.eta_richiedente ?? null,
    employmentStatus: profile.occupazione_richiedente ?? null,
    fundingGoal: profile.obiettivo ?? null,
    legalForm: profile.forma_giuridica ?? null,
    // Add default properties expected by Normalizer to satisfy types
    activityType: profile.startup ? 'Startup' : null,
    atecoAnswered: !!profile.ateco,
    budgetAnswered: !!profile.investimento_previsto,
    contributionPreference: null,
    contactEmail: null,
    contactPhone: null
  };

  // Run through existing pure deterministic normalization wrapper
  const normalizedProfile = normalizeProfile(legacyProfile);
  
  // Ritorna esattamente `PipelineResult` { evaluations, primary, borderline, excluded }
  const results = await runUnifiedPipeline({ profile: normalizedProfile, grants: allActiveGrants });
  
  return results;
}
