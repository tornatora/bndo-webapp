import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { sendOnboardingCredentialsEmail } from '@/lib/services/email';
import { randomPassword, slugify } from '@/lib/utils';

type CheckoutProvisionPayload = {
  checkoutSessionId: string;
  customerEmail: string;
  companyName: string;
  contactName: string;
  stripeCustomerId?: string | null;
  stripePaymentIntentId?: string | null;
};

export async function provisionAccountFromCheckout(payload: CheckoutProvisionPayload) {
  const supabaseAdmin = getSupabaseAdmin();

  const existingOrder = await supabaseAdmin
    .from('service_orders')
    .select('id')
    .eq('checkout_session_id', payload.checkoutSessionId)
    .maybeSingle();

  if (existingOrder.data) {
    return { alreadyProvisioned: true };
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from('companies')
    .insert({
      name: payload.companyName
    })
    .select('id')
    .single();

  if (companyError || !company) {
    throw new Error(`Failed to create company: ${companyError?.message ?? 'unknown error'}`);
  }

  const usernameBase = slugify(payload.companyName).slice(0, 18) || 'cliente';
  const username = `${usernameBase}-${Math.floor(Math.random() * 900000) + 100000}`;
  const password = randomPassword(15);

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: payload.customerEmail,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: payload.contactName,
      company_name: payload.companyName,
      username
    }
  });

  if (authError || !authData.user) {
    throw new Error(`Failed to create auth user: ${authError?.message ?? 'unknown error'}`);
  }

  const { error: profileError } = await supabaseAdmin.from('profiles').insert({
    id: authData.user.id,
    company_id: company.id,
    email: payload.customerEmail,
    full_name: payload.contactName,
    username,
    role: 'client_admin'
  });

  if (profileError) {
    throw new Error(`Failed to create profile: ${profileError.message}`);
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from('service_orders')
    .insert({
      company_id: company.id,
      status: 'active',
      stripe_customer_id: payload.stripeCustomerId ?? null,
      stripe_payment_intent_id: payload.stripePaymentIntentId ?? null,
      checkout_session_id: payload.checkoutSessionId
    })
    .select('id')
    .single();

  if (orderError || !order) {
    throw new Error(`Failed to create order: ${orderError?.message ?? 'unknown error'}`);
  }

  const { data: seedTenders } = await supabaseAdmin
    .from('tenders')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(8);

  if (seedTenders?.length) {
    const matches = seedTenders.slice(0, 6).map((tender) => ({
      company_id: company.id,
      tender_id: tender.id,
      relevance_score: 0.72 + Math.random() * 0.26,
      status: 'new' as const
    }));

    await supabaseAdmin.from('tender_matches').upsert(matches, {
      onConflict: 'company_id,tender_id'
    });
  }

  await supabaseAdmin.from('consultant_threads').upsert(
    {
      company_id: company.id
    },
    {
      onConflict: 'company_id'
    }
  );

  const { error: credentialsError } = await supabaseAdmin.from('onboarding_credentials').insert({
    checkout_session_id: payload.checkoutSessionId,
    company_id: company.id,
    user_id: authData.user.id,
    username,
    temp_password: password
  });

  if (credentialsError) {
    throw new Error(`Failed to persist onboarding credentials: ${credentialsError.message}`);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const emailResult = await sendOnboardingCredentialsEmail({
    toEmail: payload.customerEmail,
    contactName: payload.contactName,
    companyName: payload.companyName,
    username,
    tempPassword: password,
    loginUrl: `${appUrl}/login`
  });

  await supabaseAdmin
    .from('onboarding_credentials')
    .update({
      emailed_at: emailResult.sent ? new Date().toISOString() : null,
      email_provider_message_id: emailResult.sent ? emailResult.providerMessageId ?? null : null,
      email_delivery_error: emailResult.sent ? null : emailResult.error ?? 'Unknown delivery error.'
    })
    .eq('checkout_session_id', payload.checkoutSessionId);

  return {
    alreadyProvisioned: false,
    username,
    password,
    userId: authData.user.id,
    companyId: company.id,
    orderId: order.id,
    emailSent: emailResult.sent,
    emailError: emailResult.sent ? null : emailResult.error ?? null
  };
}
