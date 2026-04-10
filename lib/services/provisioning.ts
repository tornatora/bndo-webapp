import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { sendOnboardingCredentialsEmail } from '@/lib/services/email';
import { APP_URL } from '@/lib/site-urls';
import { randomPassword, slugify } from '@/lib/utils';

type CheckoutProvisionPayload = {
  checkoutSessionId: string;
  customerEmail: string;
  companyName: string;
  contactName: string;
  stripeCustomerId?: string | null;
  stripePaymentIntentId?: string | null;
  desiredUsername?: string | null; // User's choice
  desiredPassword?: string | null; // User's choice
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

    const username = payload.desiredUsername || existingProfile.username || (slugify(payload.companyName).slice(0, 18) || 'cliente');
    const password = payload.desiredPassword || null;

    if (password) {
      await supabaseAdmin.auth.admin.updateUserById(existingProfile.id, { 
        password: password,
        user_metadata: {
          ...existingProfile,
          username
        }
      });
    }

    if (username !== existingProfile.username) {
      await supabaseAdmin.from('profiles').update({ username }).eq('id', existingProfile.id);
    }

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

    let emailSent = false;
    let emailError: string | null = null;

    if (password) {
      const emailResult = await sendOnboardingCredentialsEmail({
        toEmail: payload.customerEmail,
        contactName: payload.contactName,
        companyName: payload.companyName,
        tempPassword: password,
        loginUrl: `${APP_URL}/login`
      });
      emailSent = emailResult.sent;
      emailError = emailResult.sent ? null : emailResult.error ?? 'Unknown delivery error.';

      await supabaseAdmin.from('onboarding_credentials').upsert(
        {
          checkout_session_id: payload.checkoutSessionId,
          company_id: companyId,
          user_id: existingProfile.id,
          username,
          temp_password: password,
          emailed_at: emailResult.sent ? new Date().toISOString() : null,
          email_provider_message_id: emailResult.sent ? emailResult.providerMessageId ?? null : null,
          email_delivery_error: emailResult.sent ? null : emailResult.error ?? 'Unknown delivery error.'
        },
        { onConflict: 'checkout_session_id' }
      );
    }

    return {
      alreadyProvisioned: false,
      username: existingProfile.username ?? username,
      password: password ?? '*******', // Password non mostrata se non resettata
      userId: existingProfile.id,
      companyId,
      orderId: order.id,
      emailSent,
      emailError
    };
  }

  let { data: company, error: companyError } = await supabaseAdmin
    .from('companies')
    .insert({
      name: payload.companyName
    })
    .select('id')
    .single();

  if (companyError || !company) {
    if (companyError?.message?.includes('duplicate key')) {
      // Idempotenza: se la compagnia è stata creata da una richiesta parallela, la recuperiamo
      const { data: retryCompany } = await supabaseAdmin
        .from('companies')
        .select('id')
        .eq('name', payload.companyName)
        .maybeSingle();
      if (retryCompany?.id) {
        company = retryCompany as { id: string };
      } else {
        throw new Error(`Failed to recover company: ${companyError?.message ?? 'unknown'}`);
      }
    } else {
      throw new Error(`Failed to create company: ${companyError?.message ?? 'unknown error'}`);
    }
  }

  const username = payload.desiredUsername || `${slugify(payload.companyName).slice(0, 18) || 'cliente'}-${Math.floor(Math.random() * 900000) + 100000}`;
  const password = payload.desiredPassword || randomPassword(10);

  let { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: payload.customerEmail,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: payload.contactName,
      company_name: payload.companyName,
      username
    }
  });

  if (authError) {
    // Gestione resiliente: se l'utente esiste già in Auth ma non avevamo trovato il profilo
    if (authError.message.toLowerCase().includes('already registered')) {
      const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = users?.users.find(u => u.email?.toLowerCase() === payload.customerEmail.toLowerCase());
      
      if (existingUser) {
        authData = { user: existingUser };
        authError = null;
      } else {
        throw new Error(`User already registered but not found in list: ${(authError as any).message}`);
      }
    } else {
      const msg = (authError as any)?.message || 'unknown error';
      throw new Error(`Failed to create auth user: ${msg}`);
    }
  }

  if (authError || !authData.user) {
    throw new Error('Failed to create or recover auth user.');
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

  const emailResult = await sendOnboardingCredentialsEmail({
    toEmail: payload.customerEmail,
    contactName: payload.contactName,
    companyName: payload.companyName,
    tempPassword: password,
    loginUrl: `${APP_URL}/login`
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
