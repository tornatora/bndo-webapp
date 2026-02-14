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
    .select('id, company_id')
    .eq('checkout_session_id', payload.checkoutSessionId)
    .maybeSingle();

  if (existingOrder.data) {
    const { data: existingCredentials } = await supabaseAdmin
      .from('onboarding_credentials')
      .select('user_id, username, temp_password, emailed_at, email_delivery_error')
      .eq('checkout_session_id', payload.checkoutSessionId)
      .maybeSingle();

    return {
      alreadyProvisioned: true,
      companyId: existingOrder.data.company_id,
      userId: existingCredentials?.user_id ?? null,
      username: existingCredentials?.username ?? null,
      password: existingCredentials?.temp_password ?? null,
      emailSent: Boolean(existingCredentials?.emailed_at),
      emailError: existingCredentials?.email_delivery_error ?? null
    };
  }

  // If the customer already exists (same email), reuse their company to avoid duplicates.
  const { data: existingProfile } = await supabaseAdmin
    .from('profiles')
    .select('id, company_id, full_name, username, email')
    .eq('email', payload.customerEmail)
    .maybeSingle();

  if (existingProfile?.id) {
    let companyId = existingProfile.company_id ?? null;
    if (!companyId) {
      const { data: newCompany, error: companyError } = await supabaseAdmin
        .from('companies')
        .insert({ name: payload.companyName })
        .select('id')
        .single();
      if (companyError || !newCompany?.id) {
        throw new Error(`Failed to create company: ${companyError?.message ?? 'unknown error'}`);
      }
      companyId = newCompany.id;
      const { error: profileUpdateError } = await supabaseAdmin
        .from('profiles')
        .update({ company_id: companyId })
        .eq('id', existingProfile.id);
      if (profileUpdateError) {
        throw new Error(`Failed to attach company: ${profileUpdateError.message}`);
      }
    }

    const password = randomPassword(10);
    await supabaseAdmin.auth.admin.updateUserById(existingProfile.id, { password });

    const { data: order, error: orderError } = await supabaseAdmin
      .from('service_orders')
      .insert({
        company_id: companyId,
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

    await supabaseAdmin.from('consultant_threads').upsert(
      {
        company_id: companyId
      },
      {
        onConflict: 'company_id'
      }
    );

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const emailResult = await sendOnboardingCredentialsEmail({
      toEmail: payload.customerEmail,
      contactName: payload.contactName,
      companyName: payload.companyName,
      tempPassword: password,
      loginUrl: `${appUrl}/login`
    });

    await supabaseAdmin.from('onboarding_credentials').upsert(
      {
        checkout_session_id: payload.checkoutSessionId,
        company_id: companyId,
        user_id: existingProfile.id,
        username: existingProfile.username ?? (slugify(payload.companyName).slice(0, 18) || 'cliente'),
        temp_password: password,
        emailed_at: emailResult.sent ? new Date().toISOString() : null,
        email_provider_message_id: emailResult.sent ? emailResult.providerMessageId ?? null : null,
        email_delivery_error: emailResult.sent ? null : emailResult.error ?? 'Unknown delivery error.'
      },
      { onConflict: 'checkout_session_id' }
    );

    return {
      alreadyProvisioned: false,
      username: existingProfile.username ?? null,
      password,
      userId: existingProfile.id,
      companyId,
      orderId: order.id,
      emailSent: emailResult.sent,
      emailError: emailResult.sent ? null : emailResult.error ?? null
    };
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
  // Keep it reasonably short for usability (still random).
  const password = randomPassword(10);

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
