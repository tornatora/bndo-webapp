import { getOptionalUserProfile } from '@/shared/api';
import { hasAdminAccess } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import Link from 'next/link';
import { PiaAutomationJobLogs } from './PiaAutomationJobLogs';

export const dynamic = 'force-dynamic';

type Params = Promise<{ jobId: string }>;

export default async function PiaAutomationJobDetailPage({ params }: { params: Params }) {
  try {
    if (process.env.MOCK_BACKEND !== 'true') {
      const bundle = await getOptionalUserProfile();
      if (!bundle || !hasAdminAccess(bundle.profile.role)) {
        return <JobDetailFallback />;
      }
    }
  } catch (err) {
    console.error('[admin/pia-job-detail] Auth error:', err);
    return <JobDetailFallback />;
  }

  const { jobId } = await params;
  let rawJob: Record<string, unknown> | null = null;
  try {
    const admin = getSupabaseAdmin() as any;
    const { data } = await admin
      .from('pia_automation_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();
    rawJob = data as Record<string, unknown> | null;
  } catch (err) {
    console.error('[admin/pia-job-detail] Query error:', err);
  }

  const job = rawJob;

  if (!job) {
    return (
      <div style={{ padding: 32 }}>
        <Link href="/admin/pia-automation" style={{ fontSize: 12, color: 'rgba(11,17,54,0.5)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
          ← Torna alla lista
        </Link>
        <div style={{ padding: 40, textAlign: 'center', color: 'rgba(11,17,54,0.4)', fontSize: 13 }}>Job non trovato.</div>
      </div>
    );
  }

  const status = String(job.status ?? '');
  const phase = String(job.phase ?? '');
  const progress = (job.progress as Record<string, unknown>) ?? {};
  const logs = Array.isArray((progress as any).logs) ? (progress as any).logs : [];
  const cursor = Number(job.cursor ?? 0);
  const error = job.error ? String(job.error) : null;
  const createdAt = String(job.created_at ?? '');
  const updatedAt = String(job.updated_at ?? '');
  const applicationId = String(job.application_id ?? '');

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
    <div style={{ padding: '28px 32px', maxWidth: 900 }}>
      <Link href="/admin/pia-automation" style={{ fontSize: 12, color: 'rgba(11,17,54,0.45)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20 }}>
        ← Torna alla lista automazioni
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <StatusBadge status={status} />
        <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.03em', color: '#0B1136', margin: 0 }}>
          {phaseLabels[phase] || phase}
        </h1>
      </div>

      {/* Info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        <InfoField label="ID Job" value={jobId} mono />
        <InfoField label="ID Pratica" value={applicationId} mono />
        <InfoField label="Stato" value={status} />
        <InfoField label="Fase" value={phaseLabels[phase] || phase} />
        <InfoField label="Cursore tentativi" value={String(cursor)} />
        <InfoField label="Creato il" value={createdAt.split('T')[0] || createdAt} />
        <InfoField label="Ultimo aggiornamento" value={updatedAt.split('T')[0] || updatedAt} />
        <InfoField label="Percentuale" value={(progress as any).percent != null ? `${(progress as any).percent}%` : '—'} />
      </div>

      {(progress as any).lastMessage && (
        <div style={{
          padding: '10px 14px', borderRadius: 10,
          background: '#F0FDF4', marginBottom: 20,
          fontSize: 12, color: '#16A34A', fontWeight: 500,
        }}>
          {String((progress as any).lastMessage)}
        </div>)}

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 10,
          background: '#FEF2F2', marginBottom: 20,
          fontSize: 12, color: '#DC2626',
        }}>
          Errore: {error}
        </div>
      )}

      {/* Logs */}
      <h2 style={{ fontSize: 14, fontWeight: 600, color: '#0B1136', margin: '0 0 10px' }}>Log</h2>
      <PiaAutomationJobLogs logs={logs as Array<{ ts: string; level: 'info' | 'warn' | 'error'; msg: string }>} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    queued: '#F1F2F4', running: '#DBEAFE', waiting_user: '#FEF3C7',
    done: '#DCFCE7', failed: '#FEE2E2', stopped: '#F1F2F4',
  };
  const textColors: Record<string, string> = {
    queued: 'rgba(11,17,54,0.4)', running: '#2563EB', waiting_user: '#D97706',
    done: '#16A34A', failed: '#DC2626', stopped: 'rgba(11,17,54,0.4)',
  };
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
      background: colors[status] || '#F1F2F4',
      color: textColors[status] || 'rgba(11,17,54,0.4)',
    }}>
      {status}
    </span>
  );
}

function JobDetailFallback() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 900 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0B1136', margin: '0 0 4px' }}>Dettaglio Job</h1>
      <p style={{ fontSize: 13, color: 'rgba(11,17,54,0.5)' }}>Accesso non disponibile. Ricarica o riaccedi.</p>
    </div>
  );
}

function InfoField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FAFBFC' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(11,17,54,0.4)', marginBottom: 4, letterSpacing: '0.02em' }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: '#0B1136', fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all' }}>
        {value}
      </div>
    </div>
  );
}
