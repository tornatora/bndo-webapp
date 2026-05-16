import { getOptionalUserProfile } from '@/shared/api';
import { hasAdminAccess } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function PiaAutomationAdminPage() {
  try {
    if (process.env.MOCK_BACKEND !== 'true') {
      const bundle = await getOptionalUserProfile();
      if (!bundle || !hasAdminAccess(bundle.profile.role)) {
        return <PiaFallback />;
      }
    }
  } catch (err) {
    console.error('[admin/pia-automation] Auth error:', err);
    return <PiaFallback />;
  }

  let jobs: any[] = [];
  try {
    const admin = getSupabaseAdmin() as any;
    const { data } = await admin
      .from('pia_automation_jobs')
      .select('id, application_id, created_by, status, phase, cursor, error, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(50);
    jobs = data ?? [];
  } catch (err) {
    console.error('[admin/pia-automation] Query error:', err);
  }

  const rows = jobs as Array<{
    id: string;
    application_id: string;
    created_by: string;
    status: string;
    phase: string;
    cursor: number;
    error: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: '#0B1136', margin: '0 0 4px' }}>
        Automazione PIA
      </h1>
      <p style={{ fontSize: 13, color: 'rgba(11,17,54,0.5)', margin: '0 0 24px', lineHeight: 1.5 }}>
        Job di compilazione automatica sul portale Invitalia.
      </p>

      {rows.length === 0 ? (
        <div style={{ padding: 40, background: '#FAFBFC', borderRadius: 14, textAlign: 'center', color: 'rgba(11,17,54,0.4)', fontSize: 13 }}>
          Nessun job di automazione trovato.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}

function JobRow({ job }: { job: { id: string; application_id: string; status: string; phase: string; cursor: number; error: string | null; created_at: string; updated_at: string } }) {
  const statusColors: Record<string, string> = {
    queued: '#F1F2F4',
    running: '#DBEAFE',
    waiting_user: '#FEF3C7',
    done: '#DCFCE7',
    failed: '#FEE2E2',
    stopped: '#F1F2F4',
  };
  const statusTextColors: Record<string, string> = {
    queued: 'rgba(11,17,54,0.4)',
    running: '#2563EB',
    waiting_user: '#D97706',
    done: '#16A34A',
    failed: '#DC2626',
    stopped: 'rgba(11,17,54,0.4)',
  };

  const phaseLabels: Record<string, string> = {
    spid_wait: 'Attesa SPID',
    bootstrap: 'Avvio',
    form_fill: 'Compilazione form',
    final_step_1: 'Step 1 - Controlli',
    format_download: 'Download format',
    waiting_signature: 'Attesa firma',
    format_upload: 'Upload firmato',
    attachments: 'Allegati',
    ready_to_submit: 'Pronto invio',
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '12px 16px', borderRadius: 12,
      background: '#fff', border: '0.5px solid rgba(11,17,54,0.06)',
      fontSize: 12,
    }}>
      <span style={{
        padding: '3px 8px', borderRadius: 6,
        fontSize: 10, fontWeight: 600,
        background: statusColors[job.status] || '#F1F2F4',
        color: statusTextColors[job.status] || 'rgba(11,17,54,0.4)',
        whiteSpace: 'nowrap',
      }}>
        {job.status}
      </span>

      <span style={{ color: 'rgba(11,17,54,0.5)', fontWeight: 500, minWidth: 100 }}>
        {phaseLabels[job.phase] || job.phase}
      </span>

      <span style={{ color: 'rgba(11,17,54,0.3)', fontSize: 11 }}>
        {(job.created_at || '').split('T')[0]}
      </span>

      {job.error && (
        <span style={{ color: '#DC2626', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {job.error}
        </span>
      )}

      <Link
        href={`/admin/pia-automation/${job.id}`}
        style={{
          marginLeft: 'auto', padding: '6px 12px', borderRadius: 8,
          background: '#F1F2F4', color: '#0B1136', textDecoration: 'none',
          fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
        }}
      >
        Dettaglio →
      </Link>
    </div>
  );
}

function PiaFallback() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0B1136', margin: '0 0 4px' }}>Automazione PIA</h1>
      <p style={{ fontSize: 13, color: 'rgba(11,17,54,0.5)' }}>Accesso non disponibile. Ricarica o riaccedi.</p>
    </div>
  );
}
