import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { publicError } from '@/lib/security/http';

type CheckResult = {
  name: string;
  ok: boolean;
  detail?: string;
};

async function runSupabaseChecks(): Promise<CheckResult[]> {
  const supabaseAdmin = getSupabaseAdmin();

  const [threadsCheck, messagesCheck, docsCheck, profilesCheck, storageBucketsCheck] = await Promise.all([
    supabaseAdmin.from('consultant_threads').select('id').limit(1),
    supabaseAdmin.from('consultant_messages').select('id').limit(1),
    supabaseAdmin.from('application_documents').select('id').limit(1),
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['consultant', 'ops_admin']),
    supabaseAdmin.storage.listBuckets()
  ]);

  const opsProfilesCount = profilesCheck.count ?? 0;
  const hasOpsProfiles = opsProfilesCount > 0;
  const hasDocumentsBucket =
    !storageBucketsCheck.error &&
    (storageBucketsCheck.data ?? []).some(
      (bucket) => bucket.id === 'application-documents' || bucket.name === 'application-documents'
    );

  return [
    {
      name: 'consultant_threads_table',
      ok: !threadsCheck.error,
      detail: threadsCheck.error?.message
    },
    {
      name: 'consultant_messages_table',
      ok: !messagesCheck.error,
      detail: messagesCheck.error?.message
    },
    {
      name: 'application_documents_table',
      ok: !docsCheck.error,
      detail: docsCheck.error?.message
    },
    {
      name: 'ops_profile_exists',
      ok: !profilesCheck.error && hasOpsProfiles,
      detail: profilesCheck.error?.message ?? (hasOpsProfiles ? undefined : 'Nessun utente ops_admin/consultant.')
    },
    {
      name: 'storage_bucket_application_documents',
      ok: hasDocumentsBucket,
      detail: storageBucketsCheck.error?.message ?? (hasDocumentsBucket ? undefined : 'Bucket application-documents non trovato.')
    }
  ];
}

export async function GET(request: Request) {
  const now = new Date().toISOString();
  const requiredKey = process.env.HEALTHCHECK_SECRET?.trim() || '';
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    if (!requiredKey) {
      return NextResponse.json({ ok: true, timestamp: now }, { status: 200 });
    }

    const url = new URL(request.url);
    const provided = (request.headers.get('x-healthcheck-secret') ?? url.searchParams.get('key') ?? '').trim();
    if (provided !== requiredKey) {
      return NextResponse.json({ ok: true, timestamp: now }, { status: 200 });
    }
  }

  const requiredEnv = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

  const missing = requiredEnv.filter((key) => {
    const value = process.env[key];
    return !value || value.includes('YOUR_');
  });

  if (missing.length > 0) {
    return NextResponse.json({
      ok: false,
      missing,
      checks: [],
      timestamp: now
    });
  }

  try {
    const checks = await runSupabaseChecks();
    const failures = checks.filter((check) => !check.ok);

    return NextResponse.json({
      ok: failures.length === 0,
      missing,
      checks,
      timestamp: now
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        missing,
        checks: [],
        error: publicError(error, 'Health check fallito.'),
        timestamp: now
      },
      { status: 500 }
    );
  }
}

