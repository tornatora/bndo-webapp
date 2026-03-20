export interface UserFundingProfile {
  regione?: string | null;
  provincia?: string | null;
  comune?: string | null;
  ateco?: string | null;
  settore?: string | null;
  dimensione_impresa?: "micro" | "pmi" | "grande" | null;
  forma_giuridica?: string | null;
  anni_attivita?: number | null;
  startup?: boolean | null;
  impresa_gia_costituita?: boolean | null;
  investimento_previsto?: number | null;
  contributo_richiesto?: number | null;
  numero_dipendenti?: number | null;
  eta_richiedente?: number | null;
  occupazione_richiedente?: string | null;
  obiettivo?: string | null;
  needs?: string[] | null;
  is_private_request?: boolean | null;
  
  // Advanced Intelligence Fields
  team_maggioranza_femminile_giovanile?: "female" | "youth" | "mixed" | "none" | null;
  agricoltura_terreni_iap?: "has_land_iap" | "no_land_iap" | "unknown" | null;
  innovazione_tecnologica_40?: boolean | null;
  iscrizione_albo_professionale?: boolean | null;
  is_third_sector?: boolean | null;
  property_status?: 'owned' | 'rented_registered' | 'none' | null;
}
