export {
  getOptionalUserProfile,
  requireOpsOrConsultantProfile,
  requireConsultantProfile,
  requireOpsProfile,
  requireUserProfile
} from '@/lib/auth';
export { createClient as createBrowserSupabaseClient } from '@/lib/supabase/browser';
export { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
export { getSupabaseAdmin, hasRealServiceRoleKey } from '@/lib/supabase/admin';
