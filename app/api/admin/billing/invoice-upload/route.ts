import { NextResponse } from 'next/server';
import { requireOpsProfile } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/database.types';

export const runtime = 'nodejs';

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function POST(request: Request) {
  await requireOpsProfile();

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const formData = await request.formData();
    const companyId = String(formData.get('companyId') ?? '');
    const applicationId = String(formData.get('applicationId') ?? '');
    const file = formData.get('file');

    if (!companyId || !file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Dati incompleti.' }, { status: 422 });
    }

    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'File troppo grande. Max 25MB.' }, { status: 422 });
    }

    const timestamp = Date.now();
    const storagePath = `${companyId}/invoices/${timestamp}_${safeName(file.name)}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: storageError } = await supabaseAdmin.storage.from('application-documents').upload(storagePath, fileBuffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false
    });
    if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 });

    const { data: signed } = await supabaseAdmin.storage.from('application-documents').createSignedUrl(storagePath, 60 * 60 * 24 * 7);
    const url = signed?.signedUrl ?? null;

    // Persist invoice list in company_crm.admin_fields.billing.invoices
    const { data: existing, error: readErr } = await supabaseAdmin
      .from('company_crm')
      .select('admin_fields')
      .eq('company_id', companyId)
      .maybeSingle();
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

    const adminFields = ((existing?.admin_fields ?? {}) as Record<string, unknown>) ?? {};
    const billing =
      adminFields.billing && typeof adminFields.billing === 'object' && !Array.isArray(adminFields.billing)
        ? (adminFields.billing as Record<string, unknown>)
        : ({ payments: {}, invoices: [] } as Record<string, unknown>);
    const invoices = Array.isArray(billing.invoices) ? (billing.invoices as unknown[]) : [];

    const inv = {
      id: `inv_${timestamp}`,
      applicationId: applicationId && applicationId.length > 0 ? applicationId : null,
      fileName: safeName(file.name),
      createdAt: new Date().toISOString(),
      url
    };

    const nextBilling = { ...billing, invoices: [inv, ...invoices] } as Record<string, unknown>;
    const merged = { ...adminFields, billing: nextBilling } as Record<string, unknown>;

    const { error: writeErr } = await supabaseAdmin.from('company_crm').upsert(
      {
        company_id: companyId,
        admin_fields: merged as unknown as Json,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'company_id' }
    );
    if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 });

    return NextResponse.json({ data: nextBilling }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore upload fattura.' }, { status: 500 });
  }
}
