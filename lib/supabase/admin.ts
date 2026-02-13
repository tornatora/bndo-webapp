import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

let adminClient: ReturnType<typeof createClient<Database, 'public'>> | null = null;

export function hasRealServiceRoleKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!key) return false;
  // Common placeholder patterns in our templates/scripts.
  if (key.includes('YOUR_') || key.includes('...')) return false;

  // In local "limited mode" we intentionally set service role key = anon key
  // to avoid crashes. That key must NOT be treated as privileged.
  if (anon && key === anon) return false;

  return true;
}

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL env variable.');
  }

  if (!key || key.includes('YOUR_') || key.includes('...')) {
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
