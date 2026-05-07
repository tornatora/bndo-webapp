import { cookies, headers } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import type { Database } from '@/lib/supabase/database.types';

type CookieStoreWritable = {
  set: (name: string, value: string, options?: Record<string, unknown>) => void;
};

function resolveCookieDomain(): string | undefined {
  try {
    const hostRaw =
      headers().get('x-forwarded-host') ??
      headers().get('host') ??
      '';
    const host = hostRaw.split(',')[0].trim().toLowerCase().split(':')[0];
    if (host === 'bndo.it' || host.endsWith('.bndo.it')) {
      return '.bndo.it';
    }
  } catch {
    // headers() can throw in some build-time contexts; ignore.
  }
  return undefined;
}

function mergeCookieOptions(options?: Record<string, unknown>) {
  const isLocalHttp = process.env.NODE_ENV !== 'production';
  const domain = resolveCookieDomain();
  return {
    ...(options ?? {}),
    ...(domain ? { domain } : {}),
    ...(isLocalHttp ? { secure: false } : {}),
  };
}

export function createClient() {
  const cookieStore = cookies();
  const cookieStoreWritable = cookieStore as unknown as CookieStoreWritable;
  const isLocalHttp = process.env.NODE_ENV !== 'production';
  const cookieDomain = resolveCookieDomain();

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

/**
 * Creates a Supabase client for Route Handlers that properly sets cookies
 * on the NextResponse object (bypassing the read-only request cookie store).
 */
export function createRouteHandlerClient(request: NextRequest, response?: NextResponse) {
  const isLocalHttp = process.env.NODE_ENV !== 'production';

  return createServerClient<Database, 'public'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          // If a response is provided, set cookies on it — guarantees they reach the browser
          if (response) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, mergeCookieOptions(options));
            });
            return;
          }
          // Fallback: try setting on request cookies (may silently fail)
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
          });
        },
      },
      cookieOptions: {
        ...(isLocalHttp ? { secure: false } : {}),
      },
    }
  );
}
