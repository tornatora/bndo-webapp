import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

let adminClient: ReturnType<typeof createClient<Database, 'public'>> | null = null;

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL env variable.');
  }

  if (!key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY env variable.');
  }

  if (!adminClient) {
    adminClient = createClient<Database, 'public'>(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  return adminClient;
}
