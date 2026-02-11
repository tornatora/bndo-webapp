import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { slugify } from '@/lib/utils';

const RegisterSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    companyName: z.string().trim().min(2).max(160),
    email: z.string().trim().email().max(160),
    password: z.string().min(8).max(72),
    confirmPassword: z.string().min(8).max(72)
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Le password non coincidono.',
    path: ['confirmPassword']
  });

function redirectWithMessage(request: NextRequest, path: string, key: 'error' | 'success', message: string) {
  const url = new URL(path, request.url);
  url.searchParams.set(key, message);
  return NextResponse.redirect(url, { status: 303 });
}

async function generateUniqueUsername(email: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const localPart = email.split('@')[0] ?? 'utente';
  const base = slugify(localPart).replace(/-/g, '.').slice(0, 18) || 'utente';

  for (let index = 0; index < 8; index += 1) {
    const candidate = index === 0 ? base : `${base}.${Math.floor(1000 + Math.random() * 9000)}`;
    const { data: existing } = await supabaseAdmin.from('profiles').select('id').eq('username', candidate).maybeSingle();
    if (!existing) return candidate;
  }

  return `${base}.${Date.now().toString().slice(-6)}`;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const parsed = RegisterSchema.safeParse({
    fullName: String(formData.get('fullName') ?? ''),
    companyName: String(formData.get('companyName') ?? ''),
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    confirmPassword: String(formData.get('confirmPassword') ?? '')
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Compila tutti i campi correttamente.';
    return redirectWithMessage(request, '/register', 'error', message);
  }

  const { fullName, companyName, password } = parsed.data;
  const email = parsed.data.email.toLowerCase();
  const supabaseAdmin = getSupabaseAdmin();

  const { data: profileByEmail } = await supabaseAdmin.from('profiles').select('id').eq('email', email).maybeSingle();
  if (profileByEmail) {
    return redirectWithMessage(request, '/register', 'error', 'Email gia registrata. Accedi oppure recupera password.');
  }

  let companyId: string | null = null;
  let userId: string | null = null;

  try {
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .insert({
        name: companyName
      })
      .select('id')
      .single();

    if (companyError || !company) {
      throw new Error(`Creazione azienda fallita: ${companyError?.message ?? 'errore sconosciuto'}`);
    }

    companyId = company.id;
    const username = await generateUniqueUsername(email);

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        company_name: companyName,
        username
      }
    });

    if (authError || !authData.user) {
      throw new Error(`Creazione utente fallita: ${authError?.message ?? 'errore sconosciuto'}`);
    }

    userId = authData.user.id;

    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: authData.user.id,
      company_id: company.id,
      email,
      full_name: fullName,
      username,
      role: 'client_admin'
    });

    if (profileError) {
      throw new Error(`Creazione profilo fallita: ${profileError.message}`);
    }

    await supabaseAdmin.from('consultant_threads').upsert(
      {
        company_id: company.id
      },
      {
        onConflict: 'company_id'
      }
    );

    return redirectWithMessage(
      request,
      '/login',
      'success',
      `Registrazione completata. Ora accedi con username "${username}" o con la tua email.`
    );
  } catch (error) {
    if (userId) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
    }

    if (companyId) {
      await supabaseAdmin.from('companies').delete().eq('id', companyId);
    }

    const fallback = 'Registrazione non completata. Riprova tra pochi secondi.';
    const message = error instanceof Error ? error.message : fallback;
    return redirectWithMessage(request, '/register', 'error', message);
  }
}
