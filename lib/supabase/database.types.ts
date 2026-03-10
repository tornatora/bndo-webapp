export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      leads: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          company_name: string;
          phone: string | null;
          challenge: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          email: string;
          company_name: string;
          phone?: string | null;
          challenge?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          email?: string;
          company_name?: string;
          phone?: string | null;
          challenge?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      quiz_submissions: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          phone: string;
          region: string | null;
          bando_type: string | null;
          eligibility: 'eligible' | 'not_eligible';
          answers: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          email: string;
          phone: string;
          region?: string | null;
          bando_type?: string | null;
          eligibility: 'eligible' | 'not_eligible';
          answers?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          email?: string;
          phone?: string;
          region?: string | null;
          bando_type?: string | null;
          eligibility?: 'eligible' | 'not_eligible';
          answers?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      company_crm: {
        Row: {
          company_id: string;
          internal_status: string | null;
          priority: 'bassa' | 'media' | 'alta' | null;
          tags: string[];
          admin_notes: string;
          admin_fields: Json;
          next_action_at: string | null;
          updated_at: string;
          created_at: string;
        };
        Insert: {
          company_id: string;
          internal_status?: string | null;
          priority?: 'bassa' | 'media' | 'alta' | null;
          tags?: string[];
          admin_notes?: string;
          admin_fields?: Json;
          next_action_at?: string | null;
          updated_at?: string;
          created_at?: string;
        };
        Update: {
          company_id?: string;
          internal_status?: string | null;
          priority?: 'bassa' | 'media' | 'alta' | null;
          tags?: string[];
          admin_notes?: string;
          admin_fields?: Json;
          next_action_at?: string | null;
          updated_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'company_crm_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: true;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          }
        ];
      };
      legal_consents: {
        Row: {
          id: string;
          context: 'quiz' | 'after_payment_onboarding';
          email: string;
          company_id: string | null;
          user_id: string | null;
          application_id: string | null;
          checkout_session_id: string | null;
          quiz_submission_id: string | null;
          consents: Json;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          context: 'quiz' | 'after_payment_onboarding';
          email: string;
          company_id?: string | null;
          user_id?: string | null;
          application_id?: string | null;
          checkout_session_id?: string | null;
          quiz_submission_id?: string | null;
          consents?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          context?: 'quiz' | 'after_payment_onboarding';
          email?: string;
          company_id?: string | null;
          user_id?: string | null;
          application_id?: string | null;
          checkout_session_id?: string | null;
          quiz_submission_id?: string | null;
          consents?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      companies: {
        Row: {
          id: string;
          name: string;
          vat_number: string | null;
          industry: string | null;
          annual_spend_target: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          vat_number?: string | null;
          industry?: string | null;
          annual_spend_target?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          vat_number?: string | null;
          industry?: string | null;
          annual_spend_target?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          company_id: string | null;
          email: string;
          full_name: string;
          username: string;
          role: 'client_admin' | 'consultant' | 'ops_admin';
          created_at: string;
        };
        Insert: {
          id: string;
          company_id?: string | null;
          email: string;
          full_name: string;
          username: string;
          role: 'client_admin' | 'consultant' | 'ops_admin';
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string | null;
          email?: string;
          full_name?: string;
          username?: string;
          role?: 'client_admin' | 'consultant' | 'ops_admin';
          created_at?: string;
        };
        Relationships: [];
      };
      service_orders: {
        Row: {
          id: string;
          company_id: string;
          status: 'active' | 'inactive' | 'cancelled';
          stripe_customer_id: string | null;
          stripe_payment_intent_id: string | null;
          checkout_session_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          status: 'active' | 'inactive' | 'cancelled';
          stripe_customer_id?: string | null;
          stripe_payment_intent_id?: string | null;
          checkout_session_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          status?: 'active' | 'inactive' | 'cancelled';
          stripe_customer_id?: string | null;
          stripe_payment_intent_id?: string | null;
          checkout_session_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      onboarding_credentials: {
        Row: {
          id: string;
          checkout_session_id: string;
          company_id: string;
          user_id: string;
          username: string;
          temp_password: string;
          emailed_at: string | null;
          email_provider_message_id: string | null;
          email_delivery_error: string | null;
          first_viewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          checkout_session_id: string;
          company_id: string;
          user_id: string;
          username: string;
          temp_password: string;
          emailed_at?: string | null;
          email_provider_message_id?: string | null;
          email_delivery_error?: string | null;
          first_viewed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          checkout_session_id?: string;
          company_id?: string;
          user_id?: string;
          username?: string;
          temp_password?: string;
          emailed_at?: string | null;
          email_provider_message_id?: string | null;
          email_delivery_error?: string | null;
          first_viewed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      tenders: {
        Row: {
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
        Insert: {
          id?: string;
          authority_name: string;
          title: string;
          cpv_code?: string | null;
          procurement_value?: number | null;
          deadline_at: string;
          summary: string;
          dossier_url?: string | null;
          supplier_portal_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          authority_name?: string;
          title?: string;
          cpv_code?: string | null;
          procurement_value?: number | null;
          deadline_at?: string;
          summary?: string;
          dossier_url?: string | null;
          supplier_portal_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      tender_matches: {
        Row: {
          id: string;
          company_id: string;
          tender_id: string;
          relevance_score: number;
          status: 'new' | 'in_review' | 'participating' | 'submitted';
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          tender_id: string;
          relevance_score: number;
          status?: 'new' | 'in_review' | 'participating' | 'submitted';
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          tender_id?: string;
          relevance_score?: number;
          status?: 'new' | 'in_review' | 'participating' | 'submitted';
          created_at?: string;
        };
        Relationships: [];
      };
      tender_applications: {
        Row: {
          id: string;
          company_id: string;
          tender_id: string;
          status: 'draft' | 'submitted' | 'reviewed';
          supplier_registry_status: 'pending' | 'in_progress' | 'completed';
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          tender_id: string;
          status?: 'draft' | 'submitted' | 'reviewed';
          supplier_registry_status?: 'pending' | 'in_progress' | 'completed';
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          tender_id?: string;
          status?: 'draft' | 'submitted' | 'reviewed';
          supplier_registry_status?: 'pending' | 'in_progress' | 'completed';
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      application_documents: {
        Row: {
          id: string;
          application_id: string;
          uploaded_by: string;
          file_name: string;
          storage_path: string;
          file_size: number;
          mime_type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          uploaded_by: string;
          file_name: string;
          storage_path: string;
          file_size: number;
          mime_type: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string;
          uploaded_by?: string;
          file_name?: string;
          storage_path?: string;
          file_size?: number;
          mime_type?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      scanner_dataset_snapshots: {
        Row: {
          id: string;
          source: string;
          version_hash: string;
          fetched_at: string;
          is_active: boolean;
          doc_count: number;
          docs_json: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          source: string;
          version_hash: string;
          fetched_at?: string;
          is_active?: boolean;
          doc_count?: number;
          docs_json?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          source?: string;
          version_hash?: string;
          fetched_at?: string;
          is_active?: boolean;
          doc_count?: number;
          docs_json?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      regional_scraped_grants: {
        Row: {
          id: string;
          source_url: string;
          authority_name: string;
          title: string;
          region: string;
          status: 'active' | 'closed';
          doc_json: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source_url: string;
          authority_name: string;
          title: string;
          region: string;
          status: 'active' | 'closed';
          doc_json?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          source_url?: string;
          authority_name?: string;
          title?: string;
          region?: string;
          status?: 'active' | 'closed';
          doc_json?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      consultant_threads: {
        Row: {
          id: string;
          company_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      consultant_thread_participants: {
        Row: {
          thread_id: string;
          profile_id: string;
          participant_role: 'client_admin' | 'consultant' | 'ops_admin';
          last_read_at: string;
          created_at: string;
        };
        Insert: {
          thread_id: string;
          profile_id: string;
          participant_role: 'client_admin' | 'consultant' | 'ops_admin';
          last_read_at?: string;
          created_at?: string;
        };
        Update: {
          thread_id?: string;
          profile_id?: string;
          participant_role?: 'client_admin' | 'consultant' | 'ops_admin';
          last_read_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      consultant_messages: {
        Row: {
          id: string;
          thread_id: string;
          sender_profile_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          thread_id: string;
          sender_profile_id: string;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          thread_id?: string;
          sender_profile_id?: string;
          body?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
