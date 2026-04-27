import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin, hasRealServiceRoleKey } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const ValueRecordSchema = z.record(z.string().max(180), z.string().max(1200));

const BodySchema = z.object({
  apiKey: z.string().optional(),
  createdBy: z.string().uuid().optional(),
  clientId: z.string().uuid(),
  templateId: z.string().uuid(),
  values: ValueRecordSchema.default({}),
  updatedAt: z.string().datetime().optional(),
});

const QuerySchema = z.object({
  apiKey: z.string().optional(),
  createdBy: z.string().uuid().optional(),
  clientId: z.string().uuid(),
  templateId: z.string().uuid(),
});

function resolveProvidedKey(request: Request, bodyApiKey?: string) {
  const fromHeader = request.headers.get('x-bndo-extension-key')?.trim();
  if (fromHeader) return fromHeader;
  return bodyApiKey?.trim() ?? '';
}

async function resolveOwnerProfileId(admin: any, requested?: string) {
  if (requested) return requested;

  const envOwner = process.env.BNDO_EXTENSION_OWNER_PROFILE_ID?.trim();
  if (envOwner) return envOwner;

  const { data: profile, error } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'ops_admin')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!profile?.id) throw new Error('Nessun profilo admin disponibile per i valori mappati estensione.');
  return String(profile.id);
}

function sanitizeValues(values: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(values ?? {})) {
    const key = String(rawKey || '').trim().slice(0, 180);
    if (!key) continue;
    if (/^credentials\.(password|otp)$/i.test(key)) continue;
    out[key] = String(rawValue ?? '').slice(0, 1200);
  }
  return out;
}

export async function POST(request: Request) {
  try {
    if (!hasRealServiceRoleKey()) {
      return NextResponse.json(
        { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY non configurata: sync mapped values non disponibile.' },
        { status: 500 },
      );
    }

    const body = BodySchema.parse(await request.json());
    const provided = resolveProvidedKey(request, body.apiKey);
    const expected = process.env.BNDO_EXTENSION_ADMIN_KEY?.trim() || '';

    if (expected && provided !== expected) {
      return NextResponse.json({ ok: false, error: 'API key estensione non valida.' }, { status: 401 });
    }

    const admin = getSupabaseAdmin() as any;
    const ownerId = await resolveOwnerProfileId(admin, body.createdBy);
    const values = sanitizeValues(body.values ?? {});

    const payload = {
      owner_user_id: ownerId,
      client_profile_id: body.clientId,
      template_id: body.templateId,
      values,
      updated_at: body.updatedAt || new Date().toISOString(),
    };

    const { error } = await admin
      .from('copilot_client_template_values')
      .upsert(payload, { onConflict: 'owner_user_id,client_profile_id,template_id' });

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, values });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Errore salvataggio valori mappati.' },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  try {
    if (!hasRealServiceRoleKey()) {
      return NextResponse.json(
        { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY non configurata: lettura mapped values non disponibile.' },
        { status: 500 },
      );
    }

    const url = new URL(request.url);
    const query = QuerySchema.parse({
      apiKey: url.searchParams.get('apiKey') ?? undefined,
      createdBy: url.searchParams.get('createdBy') ?? undefined,
      clientId: url.searchParams.get('clientId') ?? undefined,
      templateId: url.searchParams.get('templateId') ?? undefined,
    });

    const provided = resolveProvidedKey(request, query.apiKey);
    const expected = process.env.BNDO_EXTENSION_ADMIN_KEY?.trim() || '';

    if (expected && provided !== expected) {
      return NextResponse.json({ ok: false, error: 'API key estensione non valida.' }, { status: 401 });
    }

    const admin = getSupabaseAdmin() as any;
    const ownerId = await resolveOwnerProfileId(admin, query.createdBy);

    const { data, error } = await admin
      .from('copilot_client_template_values')
      .select('values, updated_at')
      .eq('owner_user_id', ownerId)
      .eq('client_profile_id', query.clientId)
      .eq('template_id', query.templateId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      values: sanitizeValues((data?.values ?? {}) as Record<string, string>),
      updatedAt: data?.updated_at ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Errore lettura valori mappati.' },
      { status: 500 },
    );
  }
}
