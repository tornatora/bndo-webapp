import { cookies, headers } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/lib/supabase/database.types';

type CookieStoreWritable = {
  set: (name: string, value: string, options?: Record<string, unknown>) => void;
};

export function createClient() {
  const cookieStore = cookies();
  const cookieStoreWritable = cookieStore as unknown as CookieStoreWritable;

  const isLocalHttp = process.env.NODE_ENV !== 'production';
  let cookieDomain: string | undefined;
  try {
    const hostRaw =
      headers().get('x-forwarded-host') ??
      headers().get('host') ??
      '';
    const host = hostRaw.split(',')[0].trim().toLowerCase().split(':')[0];
    if (host === 'bndo.it' || host.endsWith('.bndo.it')) {
      cookieDomain = '.bndo.it';
    }
  } catch {
    // headers() can throw in some build-time contexts; ignore and keep host-only cookies.
  }

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
            cookiesToSet.forEach(({ name, value, options }) => {
              const nextOptions = {
                ...(options ?? {}),
                ...(cookieDomain ? { domain: cookieDomain } : {}),
                ...(isLocalHttp ? { secure: false } : {}),
              };
              cookieStoreWritable.set(name, value, nextOptions);
            });
          } catch {
            // setAll can throw when called from plain Server Components.
          }
        }
      },
      cookieOptions: {
        ...(cookieDomain ? { domain: cookieDomain } : {}),
        ...(isLocalHttp ? { secure: false } : {}),
      },
    }
  );
}
