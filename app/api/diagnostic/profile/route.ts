import { NextResponse } from 'next/server';
import { getOptionalUserProfile } from '@/shared/api';
import { hasAdminAccess, hasConsultantAccess } from '@/lib/roles';

/**
 * GET /api/diagnostic/profile
 *
 * Mostra i dati del profilo corrente (utile per debug permessi admin).
 */
export async function GET() {
  try {
    const bundle = await getOptionalUserProfile();

    if (!bundle) {
      return NextResponse.json({
        authenticated: false,
        message: 'Nessuna sessione attiva.',
        tip: 'Effettua il login prima di usare questo endpoint.',
      });
    }

    const { user, profile } = bundle;

    return NextResponse.json({
      authenticated: true,
      auth: {
        email: user.email,
        userId: user.id,
        phone: user.phone ?? null,
        lastSignIn: user.last_sign_in_at ?? null,
      },
      profile: {
        id: profile.id,
        fullName: profile.full_name ?? null,
        email: profile.email ?? null,
        username: profile.username ?? null,
        role: profile.role ?? null,
        companyId: profile.company_id ?? null,
        hasAdminAccess: hasAdminAccess(profile.role),
        hasConsultantAccess: hasConsultantAccess(profile.role),
        isClientAdmin: profile.role === 'client_admin',
      },
      computedUsername: deriveDiagnostic(profile),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({
      error: 'Errore nel recupero profilo.',
      detail: err instanceof Error ? err.message : 'unknown',
    }, { status: 500 });
  }
}

function deriveDiagnostic(profile: { full_name?: string | null; email?: string | null; id: string }) {
  const safe = String(profile.full_name ?? '').trim();
  if (safe && /^[a-zA-ZÀ-ÿ\s'-]+$/.test(safe)) {
    return safe.toLowerCase().replace(/\s+/g, '');
  }
  if (profile.email) {
    return profile.email.split('@')[0].toLowerCase();
  }
  return profile.id.slice(0, 8);
}
