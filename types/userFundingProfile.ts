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
}
