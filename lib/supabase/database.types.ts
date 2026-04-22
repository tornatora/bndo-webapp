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
      practice_payments: {
        Row: {
          id: string;
          quiz_submission_id: string | null;
          company_id: string | null;
          user_id: string | null;
          application_id: string | null;
          practice_type: string;
          grant_slug: string;
          grant_title: string;
          amount_cents: number;
          currency: string;
          status: 'pending' | 'paid' | 'failed' | 'canceled' | 'refunded';
          priority_queue: boolean;
          onboarding_status: 'not_started' | 'in_progress' | 'completed';
          onboarding_completed_at: string | null;
          stripe_checkout_session_id: string;
          stripe_payment_intent_id: string | null;
          stripe_customer_id: string | null;
          customer_email: string;
          paid_at: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          quiz_submission_id?: string | null;
          company_id?: string | null;
          user_id?: string | null;
          application_id?: string | null;
          practice_type: string;
          grant_slug: string;
          grant_title: string;
          amount_cents: number;
          currency?: string;
          status?: 'pending' | 'paid' | 'failed' | 'canceled' | 'refunded';
          priority_queue?: boolean;
          onboarding_status?: 'not_started' | 'in_progress' | 'completed';
          onboarding_completed_at?: string | null;
          stripe_checkout_session_id: string;
          stripe_payment_intent_id?: string | null;
          stripe_customer_id?: string | null;
          customer_email: string;
          paid_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          quiz_submission_id?: string | null;
          company_id?: string | null;
          user_id?: string | null;
          application_id?: string | null;
          practice_type?: string;
          grant_slug?: string;
          grant_title?: string;
          amount_cents?: number;
          currency?: string;
          status?: 'pending' | 'paid' | 'failed' | 'canceled' | 'refunded';
          priority_queue?: boolean;
          onboarding_status?: 'not_started' | 'in_progress' | 'completed';
          onboarding_completed_at?: string | null;
          stripe_checkout_session_id?: string;
          stripe_payment_intent_id?: string | null;
          stripe_customer_id?: string | null;
          customer_email?: string;
          paid_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
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
          external_grant_id: string | null;
          grant_slug: string | null;
          metadata: Json;
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
          external_grant_id?: string | null;
          grant_slug?: string | null;
          metadata?: Json;
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
          external_grant_id?: string | null;
          grant_slug?: string | null;
          metadata?: Json;
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
          requirement_key: string | null;
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
          requirement_key?: string | null;
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
          requirement_key?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      practice_quiz_templates: {
        Row: {
          id: string;
          application_id: string;
          tender_id: string;
          grant_external_id: string | null;
          grant_slug: string | null;
          grant_title: string;
          source_channel: 'scanner' | 'chat' | 'direct' | 'admin';
          status: 'active' | 'archived';
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          tender_id: string;
          grant_external_id?: string | null;
          grant_slug?: string | null;
          grant_title: string;
          source_channel: 'scanner' | 'chat' | 'direct' | 'admin';
          status?: 'active' | 'archived';
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string;
          tender_id?: string;
          grant_external_id?: string | null;
          grant_slug?: string | null;
          grant_title?: string;
          source_channel?: 'scanner' | 'chat' | 'direct' | 'admin';
          status?: 'active' | 'archived';
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      practice_quiz_questions: {
        Row: {
          id: string;
          template_id: string;
          sort_order: number;
          question_key: string;
          label: string;
          description: string | null;
          question_type: 'single_select' | 'boolean' | 'text' | 'number';
          options: Json;
          is_required: boolean;
          validation: Json;
          rule: Json;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          template_id: string;
          sort_order?: number;
          question_key: string;
          label: string;
          description?: string | null;
          question_type: 'single_select' | 'boolean' | 'text' | 'number';
          options?: Json;
          is_required?: boolean;
          validation?: Json;
          rule?: Json;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          template_id?: string;
          sort_order?: number;
          question_key?: string;
          label?: string;
          description?: string | null;
          question_type?: 'single_select' | 'boolean' | 'text' | 'number';
          options?: Json;
          is_required?: boolean;
          validation?: Json;
          rule?: Json;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      practice_quiz_submissions: {
        Row: {
          id: string;
          template_id: string;
          application_id: string;
          tender_id: string;
          company_id: string;
          user_id: string;
          source_channel: 'scanner' | 'chat' | 'direct' | 'admin';
          eligibility: 'eligible' | 'likely_eligible' | 'not_eligible' | 'needs_review';
          answers: Json;
          completed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          template_id: string;
          application_id: string;
          tender_id: string;
          company_id: string;
          user_id: string;
          source_channel: 'scanner' | 'chat' | 'direct' | 'admin';
          eligibility: 'eligible' | 'likely_eligible' | 'not_eligible' | 'needs_review';
          answers?: Json;
          completed_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          template_id?: string;
          application_id?: string;
          tender_id?: string;
          company_id?: string;
          user_id?: string;
          source_channel?: 'scanner' | 'chat' | 'direct' | 'admin';
          eligibility?: 'eligible' | 'likely_eligible' | 'not_eligible' | 'needs_review';
          answers?: Json;
          completed_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      practice_document_requirements: {
        Row: {
          id: string;
          application_id: string;
          tender_id: string;
          requirement_key: string;
          label: string;
          description: string | null;
          is_required: boolean;
          status: 'missing' | 'uploaded' | 'waived';
          source_channel: 'scanner' | 'chat' | 'direct' | 'admin';
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          tender_id: string;
          requirement_key: string;
          label: string;
          description?: string | null;
          is_required?: boolean;
          status?: 'missing' | 'uploaded' | 'waived';
          source_channel: 'scanner' | 'chat' | 'direct' | 'admin';
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string;
          tender_id?: string;
          requirement_key?: string;
          label?: string;
          description?: string | null;
          is_required?: boolean;
          status?: 'missing' | 'uploaded' | 'waived';
          source_channel?: 'scanner' | 'chat' | 'direct' | 'admin';
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
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
      admin_notifications: {
        Row: {
          id: string;
          type: 'message' | 'quiz_submission' | 'system';
          title: string;
          body: string;
          entity_id: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          type: 'message' | 'quiz_submission' | 'system';
          title: string;
          body: string;
          entity_id?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          type?: 'message' | 'quiz_submission' | 'system';
          title?: string;
          body?: string;
          entity_id?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      notification_inbox: {
        Row: {
          id: string;
          recipient_profile_id: string;
          recipient_role: 'client_admin' | 'consultant' | 'ops_admin';
          event_type: string;
          event_group:
            | 'lead_quiz'
            | 'pratiche'
            | 'documenti'
            | 'pagamenti'
            | 'chat'
            | 'consulenti'
            | 'sistema';
          priority: 'high' | 'medium';
          title: string;
          body: string;
          entity_type: string | null;
          entity_id: string | null;
          company_id: string | null;
          application_id: string | null;
          thread_id: string | null;
          action_path: string | null;
          payload: Json;
          dedupe_key: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          recipient_profile_id: string;
          recipient_role: 'client_admin' | 'consultant' | 'ops_admin';
          event_type: string;
          event_group:
            | 'lead_quiz'
            | 'pratiche'
            | 'documenti'
            | 'pagamenti'
            | 'chat'
            | 'consulenti'
            | 'sistema';
          priority?: 'high' | 'medium';
          title: string;
          body: string;
          entity_type?: string | null;
          entity_id?: string | null;
          company_id?: string | null;
          application_id?: string | null;
          thread_id?: string | null;
          action_path?: string | null;
          payload?: Json;
          dedupe_key?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          recipient_profile_id?: string;
          recipient_role?: 'client_admin' | 'consultant' | 'ops_admin';
          event_type?: string;
          event_group?:
            | 'lead_quiz'
            | 'pratiche'
            | 'documenti'
            | 'pagamenti'
            | 'chat'
            | 'consulenti'
            | 'sistema';
          priority?: 'high' | 'medium';
          title?: string;
          body?: string;
          entity_type?: string | null;
          entity_id?: string | null;
          company_id?: string | null;
          application_id?: string | null;
          thread_id?: string | null;
          action_path?: string | null;
          payload?: Json;
          dedupe_key?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      notification_tasks: {
        Row: {
          id: string;
          notification_id: string | null;
          created_by_profile_id: string;
          assigned_to_profile_id: string;
          status: 'open' | 'in_progress' | 'done' | 'cancelled';
          title: string;
          description: string | null;
          due_at: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          notification_id?: string | null;
          created_by_profile_id: string;
          assigned_to_profile_id: string;
          status?: 'open' | 'in_progress' | 'done' | 'cancelled';
          title: string;
          description?: string | null;
          due_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          notification_id?: string | null;
          created_by_profile_id?: string;
          assigned_to_profile_id?: string;
          status?: 'open' | 'in_progress' | 'done' | 'cancelled';
          title?: string;
          description?: string | null;
          due_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      estrattore_extractions: {
        Row: {
          id: string;
          user_id: string;
          original_filename: string | null;
          extracted_data: Json;
          custom_fields: Json;
          status: 'pending' | 'processing' | 'completed' | 'failed';
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          original_filename?: string | null;
          extracted_data?: Json;
          custom_fields?: Json;
          status?: 'pending' | 'processing' | 'completed' | 'failed';
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          original_filename?: string | null;
          extracted_data?: Json;
          custom_fields?: Json;
          status?: 'pending' | 'processing' | 'completed' | 'failed';
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'estrattore_extractions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
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
