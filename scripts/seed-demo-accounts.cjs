/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (typeof process.env[key] === 'undefined') {
      process.env[key] = value;
    }
  }
}

function randomId(prefix = 'demo') {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function isMissingTableError(error) {
  const m = String(error?.message || '').toLowerCase();
  return m.includes('does not exist') || m.includes('could not find the table') || m.includes('schema cache');
}

async function main() {
  loadEnvFile(path.resolve(process.cwd(), '.env'));
  loadEnvFile(path.resolve(process.cwd(), '.env.local'));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase env vars');
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'x-client-info': 'bndo-demo-seed/1.0' } },
  });

  const DEMO_PASSWORD = 'DemoBndo#2026';

  const demoUsers = [
    {
      email: 'admin.demo@bndo.it',
      username: 'admin_demo_bndo',
      full_name: 'Admin Demo BNDO',
      role: 'ops_admin',
    },
    {
      email: 'consulente.demo@bndo.it',
      username: 'consulente_demo_bndo',
      full_name: 'Consulente Demo BNDO',
      role: 'consultant',
    },
    {
      email: 'cliente.demo@bndo.it',
      username: 'cliente_demo_bndo',
      full_name: 'Cliente Demo BNDO',
      role: 'client_admin',
    },
  ];

  async function tableAvailable(table) {
    const { error } = await supabase.from(table).select('*', { head: true, count: 'exact' }).limit(1);
    if (!error) return true;
    if (isMissingTableError(error)) return false;
    return false;
  }

  async function listAuthUsers() {
    const users = [];
    let page = 1;
    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      users.push(...(data?.users || []));
      if (!data?.users?.length || data.users.length < 200 || page >= 20) break;
      page += 1;
    }
    return users;
  }

  async function ensureAuthAndProfile(allUsers, user, companyIdForClient) {
    let authUser = allUsers.find((u) => (u.email || '').toLowerCase() === user.email.toLowerCase());

    if (!authUser) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: user.full_name },
      });
      if (error) throw error;
      authUser = data.user;
      allUsers.push(authUser);
    } else {
      const { error } = await supabase.auth.admin.updateUserById(authUser.id, {
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { ...(authUser.user_metadata || {}), full_name: user.full_name },
      });
      if (error) throw error;
    }

    const profilePayload = {
      id: authUser.id,
      email: user.email,
      full_name: user.full_name,
      username: user.username,
      role: user.role,
      company_id: user.role === 'client_admin' ? companyIdForClient : null,
    };

    const { error: profileError } = await supabase.from('profiles').upsert(profilePayload, { onConflict: 'id' });
    if (profileError) throw profileError;

    return { id: authUser.id, ...user };
  }

  const availability = {
    companies: await tableAvailable('companies'),
    profiles: await tableAvailable('profiles'),
    tenders: await tableAvailable('tenders'),
    tender_applications: await tableAvailable('tender_applications'),
    practice_document_requirements: await tableAvailable('practice_document_requirements'),
    application_documents: await tableAvailable('application_documents'),
    consultant_practice_assignments: await tableAvailable('consultant_practice_assignments'),
    practice_payments: await tableAvailable('practice_payments'),
    platform_events: await tableAvailable('platform_events'),
    admin_audit_logs: await tableAvailable('admin_audit_logs'),
    practice_payment_ledger: await tableAvailable('practice_payment_ledger'),
  };

  if (!availability.profiles || !availability.companies) {
    throw new Error('Required base tables missing (profiles/companies).');
  }
  const warnings = [];

  const companyName = 'Demo Agricola Calabria SRL';
  let companyId;
  {
    const { data: existing } = await supabase.from('companies').select('id').eq('name', companyName).maybeSingle();
    if (existing?.id) {
      companyId = existing.id;
    } else {
      const { data, error } = await supabase
        .from('companies')
        .insert({
          name: companyName,
          vat_number: 'IT03166440805',
          industry: 'Agricoltura',
          annual_spend_target: 120000,
        })
        .select('id')
        .single();
      if (error) throw error;
      companyId = data.id;
    }
  }

  const allUsers = await listAuthUsers();
  const created = {};
  for (const user of demoUsers) {
    created[user.role] = await ensureAuthAndProfile(allUsers, user, companyId);
  }

  let tenderId = null;
  if (availability.tenders) {
    const tenderTitle = 'Bando Demo Agricoltura Calabria 2026';
    const { data: existingTender } = await supabase.from('tenders').select('id').eq('title', tenderTitle).maybeSingle();
    if (existingTender?.id) {
      tenderId = existingTender.id;
    } else {
      const basePayload = {
        authority_name: 'Regione Calabria',
        title: tenderTitle,
        deadline_at: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString(),
        summary: 'Contributi demo per investimenti agricoli innovativi in Calabria.',
      };
      const variants = [
        {
          ...basePayload,
          cpv_code: 'AGR-2026',
          procurement_value: 200000,
          dossier_url: 'https://bndo.it',
          supplier_portal_url: 'https://bndo.it',
          grant_slug: 'bando-demo-agricoltura-calabria-2026',
          metadata: { source: 'demo-seed' },
        },
        {
          ...basePayload,
          cpv_code: 'AGR-2026',
          procurement_value: 200000,
          dossier_url: 'https://bndo.it',
          supplier_portal_url: 'https://bndo.it',
        },
        {
          ...basePayload,
          cpv_code: 'AGR-2026',
          procurement_value: 200000,
        },
        basePayload,
      ];

      let inserted = null;
      let lastError = null;
      for (const payload of variants) {
        const { data, error } = await supabase.from('tenders').insert(payload).select('id').single();
        if (!error) {
          inserted = data;
          break;
        }
        lastError = error;
      }
      if (!inserted) throw lastError ?? new Error('Impossibile creare tender demo');
      tenderId = inserted.id;
    }
  }

  let applicationId = null;
  if (availability.tender_applications && tenderId) {
    const { data: existingApp } = await supabase
      .from('tender_applications')
      .select('id')
      .eq('company_id', companyId)
      .eq('tender_id', tenderId)
      .maybeSingle();

    if (existingApp?.id) {
      applicationId = existingApp.id;
    } else {
      const { data, error } = await supabase
        .from('tender_applications')
        .insert({
          company_id: companyId,
          tender_id: tenderId,
          status: 'draft',
          supplier_registry_status: 'in_progress',
          notes: 'Pratica demo per test dashboard admin/consulente',
        })
        .select('id')
        .single();
      if (error) throw error;
      applicationId = data.id;
    }
  }

  if (availability.practice_document_requirements && applicationId && tenderId) {
    const requirementRows = [
      { requirement_key: 'documento_identita', label: 'Documento di identità', is_required: true, status: 'uploaded' },
      { requirement_key: 'codice_fiscale', label: 'Codice fiscale', is_required: true, status: 'uploaded' },
      { requirement_key: 'pec', label: 'PEC aziendale', is_required: true, status: 'missing' },
      { requirement_key: 'firma_digitale', label: 'Firma digitale', is_required: true, status: 'missing' },
      { requirement_key: 'visura_camerale', label: 'Visura camerale aggiornata', is_required: true, status: 'missing' },
    ];
    const payload = requirementRows.map((item) => ({
      application_id: applicationId,
      tender_id: tenderId,
      requirement_key: item.requirement_key,
      label: item.label,
      description: null,
      is_required: item.is_required,
      status: item.status,
      source_channel: 'admin',
      metadata: { demo: true },
    }));
    const { error } = await supabase.from('practice_document_requirements').upsert(payload, {
      onConflict: 'application_id,requirement_key',
    });
    if (error) {
      if (isMissingTableError(error)) {
        warnings.push('practice_document_requirements non disponibile (schema cache).');
      } else {
        throw error;
      }
    }
  }

  if (availability.application_documents && applicationId) {
    const docs = [
      { file_name: 'Documento-identita-demo.pdf', requirement_key: 'documento_identita' },
      { file_name: 'Codice-fiscale-demo.pdf', requirement_key: 'codice_fiscale' },
    ];
    for (const doc of docs) {
      const { data: existsDoc } = await supabase
        .from('application_documents')
        .select('id')
        .eq('application_id', applicationId)
        .eq('file_name', doc.file_name)
        .maybeSingle();
      if (!existsDoc) {
        const { error } = await supabase.from('application_documents').insert({
          application_id: applicationId,
          uploaded_by: created.client_admin.id,
          file_name: doc.file_name,
          storage_path: `demo/${companyId}/${applicationId}/${doc.file_name}`,
          file_size: 2048,
          mime_type: 'application/pdf',
          requirement_key: doc.requirement_key,
        });
        if (error && !String(error.message || '').toLowerCase().includes('duplicate')) {
          if (isMissingTableError(error)) {
            warnings.push('application_documents non disponibile (schema cache).');
            break;
          }
          throw error;
        }
      }
    }
  }

  if (availability.consultant_practice_assignments && applicationId) {
    const { error } = await supabase.from('consultant_practice_assignments').upsert(
      {
        application_id: applicationId,
        company_id: companyId,
        consultant_profile_id: created.consultant.id,
        assigned_by_profile_id: created.ops_admin.id,
        note: 'Assegnazione demo per test',
        status: 'active',
      },
      { onConflict: 'application_id,consultant_profile_id' },
    );
    if (error) {
      if (isMissingTableError(error)) {
        warnings.push('consultant_practice_assignments non disponibile (schema cache).');
      } else {
        throw error;
      }
    }
  }

  if (availability.practice_payments && applicationId) {
    const paidSession = `cs_demo_paid_${randomId('x')}`;
    const pendingSession = `cs_demo_pending_${randomId('x')}`;
    let canWritePracticePayments = true;

    const { data: paidExists } = await supabase
      .from('practice_payments')
      .select('id')
      .eq('application_id', applicationId)
      .eq('status', 'paid')
      .limit(1);

    if (!paidExists || paidExists.length === 0) {
      const { error } = await supabase.from('practice_payments').insert({
        company_id: companyId,
        user_id: created.client_admin.id,
        application_id: applicationId,
        practice_type: 'contributo_agricolo',
        grant_slug: 'bando-demo-agricoltura-calabria-2026',
        grant_title: 'Bando Demo Agricoltura Calabria 2026',
        amount_cents: 49000,
        currency: 'eur',
        status: 'paid',
        onboarding_status: 'completed',
        onboarding_completed_at: new Date().toISOString(),
        stripe_checkout_session_id: paidSession,
        stripe_payment_intent_id: randomId('pi'),
        stripe_customer_id: randomId('cus'),
        customer_email: 'cliente.demo@bndo.it',
        paid_at: new Date().toISOString(),
        metadata: { demo: true },
      });
      if (error) {
        if (isMissingTableError(error)) {
          warnings.push('practice_payments non disponibile (schema cache).');
          canWritePracticePayments = false;
        } else {
          throw error;
        }
      }
    }

    if (canWritePracticePayments) {
      const { data: pendingExists } = await supabase
        .from('practice_payments')
        .select('id')
        .eq('application_id', applicationId)
        .eq('status', 'pending')
        .limit(1);

      if (!pendingExists || pendingExists.length === 0) {
        const { error } = await supabase.from('practice_payments').insert({
          company_id: companyId,
          user_id: created.client_admin.id,
          application_id: applicationId,
          practice_type: 'contributo_agricolo',
          grant_slug: 'bando-demo-agricoltura-calabria-2026',
          grant_title: 'Bando Demo Agricoltura Calabria 2026',
          amount_cents: 12000,
          currency: 'eur',
          status: 'pending',
          onboarding_status: 'in_progress',
          stripe_checkout_session_id: pendingSession,
          stripe_payment_intent_id: null,
          stripe_customer_id: randomId('cus'),
          customer_email: 'cliente.demo@bndo.it',
          metadata: { demo: true },
        });
        if (error) {
          if (isMissingTableError(error)) {
            warnings.push('practice_payments non disponibile (schema cache).');
          } else {
            throw error;
          }
        }
      }
    }
  }

  if (availability.platform_events) {
    const events = [
      'page_view',
      'scanner_started',
      'scanner_completed',
      'quiz_started',
      'quiz_completed',
      'onboarding_started',
      'onboarding_completed',
      'practice_created',
      'practice_activated',
    ].map((eventType, idx) => ({
      event_type: eventType,
      actor_profile_id: created.client_admin.id,
      actor_role: 'client_admin',
      company_id: companyId,
      application_id: applicationId || null,
      session_id: `demo-session-${idx + 1}`,
      page_path: '/dashboard/pratiche',
      channel: 'dashboard',
      metadata: { demo: true, deviceClass: 'mobile', countryCode: 'IT' },
      created_at: new Date(Date.now() - idx * 60 * 60 * 1000).toISOString(),
    }));

    const { error } = await supabase.from('platform_events').insert(events);
    if (error && !String(error.message || '').toLowerCase().includes('duplicate')) {
      if (isMissingTableError(error)) {
        warnings.push('platform_events non disponibile (schema cache).');
      } else {
        throw error;
      }
    }
  }

  if (availability.admin_audit_logs) {
    const { error } = await supabase.from('admin_audit_logs').insert({
      action_type: 'demo.seed.completed',
      actor_profile_id: created.ops_admin.id,
      actor_role: 'ops_admin',
      target_type: 'company',
      target_id: companyId,
      company_id: companyId,
      application_id: applicationId || null,
      details: { demo: true, note: 'Seed account e dati demo creati' },
    });
    if (error && !String(error.message || '').toLowerCase().includes('duplicate')) {
      if (isMissingTableError(error)) {
        warnings.push('admin_audit_logs non disponibile (schema cache).');
      } else {
        throw error;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        credentials: {
          admin: { email: 'admin.demo@bndo.it', password: DEMO_PASSWORD },
          consultant: { email: 'consulente.demo@bndo.it', password: DEMO_PASSWORD },
          client: { email: 'cliente.demo@bndo.it', password: DEMO_PASSWORD },
        },
        demo: {
          companyId,
          tenderId,
          applicationId,
          availability,
          warnings,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('SEED_FAILED', error?.message || error);
  process.exit(1);
});
