'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AtomicPageLoader } from '@/components/dashboard/AtomicPageLoader';
import { ClientUploadDocButton } from '@/components/dashboard/ClientUploadDocButton';

type PracticeDetail = {
  id: string;
  title: string;
  authority?: string;
  status: string;
  updatedAt: string;
  progressPct: number;
  statusLabel: string;
  statusClassName: string;
  checklist: Array<{
    key: string;
    label: string;
    description: string | null;
    isRequired: boolean;
    uploaded: boolean;
  }>;
  docs: Array<{
    id: string;
    fileName: string;
    createdAt: string;
    requirementKey: string | null;
  }>;
};

type PracticeDetailViewProps = {
  applicationId: string;
  onBack?: () => void;
};

export function PracticeDetailView({ applicationId, onBack }: PracticeDetailViewProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PracticeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
    router.push('/dashboard/pratiche');
  }, [onBack, router]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/practices/${applicationId}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Errore durante il caricamento della pratica.');
      setData(json.application);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore imprevisto.');
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return <AtomicPageLoader className="mobile-menu-safe" title="Sto caricando" targetWord="pratica" />;
  }

  if (error || !data) {
    return (
      <div className="view-pane-content mobile-menu-safe" style={{ padding: 'clamp(14px, 2.5vw, 24px)' }}>
        <button onClick={handleBack} className="btn-back-simple">← Torna alle pratiche</button>
        <div className="info-box error" style={{ marginTop: 24 }}>
          {error || 'Pratica non trovata.'}
        </div>
      </div>
    );
  }

  const missing = data.checklist.filter(c => !c.uploaded);

  return (
    <div className="view-pane-content mobile-menu-safe" style={{ padding: 'clamp(14px, 2.5vw, 24px)' }}>
      <button onClick={handleBack} className="btn-back-simple" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>
        ← Torna alle pratiche
      </button>

      <div className="page-head">
        <div className="pratica-type" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 4 }}>Dettaglio Pratica</div>
        <h1 className="page-title" style={{ fontSize: 24, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>{data.title}</h1>
        <div className="page-sub" style={{ fontSize: 13, color: '#64748b' }}>
          Aggiornata il {new Date(data.updatedAt).toLocaleString('it-IT')}
        </div>
      </div>

      <div className="practice-card" style={{ marginTop: 24, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <div>
             <div style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>Stato Corrente</div>
             <div className={data.statusClassName}>{data.statusLabel}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
             <div style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>Avanzamento</div>
             <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>{data.progressPct}%</div>
          </div>
        </div>

        <div className="progress-bar" style={{ height: 10, background: 'rgba(11,17,54,0.05)', borderRadius: 5, overflow: 'hidden' }}>
          <div className="progress-fill" style={{ width: `${data.progressPct}%`, height: '100%', background: '#49cc72' }} />
        </div>
      </div>

      <section style={{ marginTop: 32 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>Documenti Richiesti</div>
        
        <div className="admin-checklist" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.checklist.map((req) => (
            <div key={req.key} style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, padding: '14px 18px', background: 'white', border: '1px solid rgba(11,17,54,0.06)', borderRadius: 12 }}>
              <div style={{ 
                width: 20, height: 20, borderRadius: '50%', 
                backgroundColor: req.uploaded ? '#49cc72' : 'rgba(11,17,54,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12
              }}>
                {req.uploaded ? '✓' : ''}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>{req.label}</div>
                {req.description && <div style={{ fontSize: 12, color: '#64748b' }}>{req.description}</div>}
              </div>
              {!req.uploaded && (
                <ClientUploadDocButton
                  applicationId={data.id}
                  requirementKey={req.key}
                  documentLabel={req.label}
                  onUploadComplete={() => fetchData()}
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {data.docs.length > 0 && (
         <section style={{ marginTop: 32 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>Documenti Caricati</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
               {data.docs.map(doc => (
                  <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(11,17,54,0.02)', borderRadius: 8 }}>
                     <div style={{ fontSize: 14, color: 'var(--navy)' }}>{doc.fileName}</div>
                     <div style={{ fontSize: 12, color: '#64748b' }}>{new Date(doc.createdAt).toLocaleDateString()}</div>
                  </div>
               ))}
            </div>
         </section>
      )}
    </div>
  );
}
