import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/lib/supabase/database.types';

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const host = (request.headers.get('host') ?? '').toLowerCase();

  if (host.startsWith('app.bndo.it') && path === '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (host.startsWith('admin.bndo.it') && path === '/') {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  let response = NextResponse.next({
    request
  });

  const supabase = createServerClient<Database, 'public'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const isDashboardPath = path.startsWith('/dashboard');
  const isAdminPath = path.startsWith('/admin');
  const isAuthPath = path.startsWith('/login');
  const hasAuthError = request.nextUrl.searchParams.has('error');

  if ((isDashboardPath || isAdminPath) && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isAuthPath && user && !hasAuthError) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/', '/quiz', '/dashboard/:path*', '/admin/:path*', '/login']
};
