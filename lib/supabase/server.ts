import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/lib/supabase/database.types';

type CookieStoreWritable = {
  set: (name: string, value: string, options?: Record<string, unknown>) => void;
};

export function createClient() {
  const cookieStore = cookies();
  const cookieStoreWritable = cookieStore as unknown as CookieStoreWritable;

  return createServerClient<Database, 'public'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStoreWritable.set(name, value, options));
          } catch {
            // setAll can throw when called from plain Server Components.
          }
        }
      }
    }
  );
}
