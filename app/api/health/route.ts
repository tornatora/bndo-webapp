import { NextResponse } from 'next/server';

export async function GET() {
  const requiredEnv = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];

  const missing = requiredEnv.filter((key) => {
    const value = process.env[key];
    return !value || value.includes('YOUR_');
  });

  return NextResponse.json({
    ok: missing.length === 0,
    missing
  });
}
