export type ProfileRole = 'client_admin' | 'consultant' | 'ops_admin';

export type Lead = {
  id: string;
  full_name: string;
  email: string;
  company_name: string;
  phone: string | null;
  challenge: string | null;
  created_at: string;
};

export type Company = {
  id: string;
  name: string;
  vat_number: string | null;
  industry: string | null;
  annual_spend_target: number | null;
  created_at: string;
};

export type Profile = {
  id: string;
  company_id: string | null;
  email: string;
  full_name: string;
  username: string;
  role: ProfileRole;
  created_at: string;
};

export type Tender = {
  id: string;
  authority_name: string;
  title: string;
  cpv_code: string | null;
  procurement_value: number | null;
  deadline_at: string;
  summary: string;
  dossier_url: string | null;
  supplier_portal_url: string | null;
  created_at: string;
};

export type TenderMatch = {
  id: string;
  company_id: string;
  tender_id: string;
  relevance_score: number;
  status: 'new' | 'in_review' | 'participating' | 'submitted';
  tender?: Tender;
};

export type Application = {
  id: string;
  company_id: string;
  tender_id: string;
  status: 'draft' | 'submitted' | 'reviewed';
  notes: string | null;
  supplier_registry_status: 'pending' | 'in_progress' | 'completed';
  created_at: string;
};

export type ConsultantMessage = {
  id: string;
  thread_id: string;
  sender_profile_id: string;
  body: string;
  created_at: string;
};

export type SupplementalData = Record<string, string>;
