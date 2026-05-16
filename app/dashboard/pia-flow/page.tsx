'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PiaWelcome } from '@/components/pia/PiaWelcome';
import { PiaUpload } from '@/components/pia/PiaUpload';
import { PiaFormWizard } from '@/components/pia/PiaFormWizard';
import { PiaCelebration } from '@/components/pia/PiaCelebration';

type Screen = 'welcome' | 'upload' | 'form' | 'celebration';

interface PiaFormData {
  contactPhone: string;
  activityConfirmed: Record<string, unknown>;
  employmentStatus: Record<string, unknown>;
  criminalPrecedents: Record<string, unknown>;
  publicAid: Record<string, unknown>;
  effectiveOwner: Record<string, unknown>;
  expensePlan: Record<string, unknown>;
  businessIdea: string;
  iban: string;
  ordineIscrizione: Record<string, unknown>;
  casellarioGiudiziale: Record<string, unknown>;
  gdprConsents: Record<string, unknown>;
}

type BandoType = 'resto-al-sud-2-0' | 'autoimpiego-centro-nord';

export default function PiaFlowPage() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('welcome');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [bandoType, setBandoType] = useState<BandoType | null>(null);
  const [bandoTitle, setBandoTitle] = useState('');
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [formData, setFormData] = useState<PiaFormData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Detect bando from URL param or default
    const params = new URLSearchParams(window.location.search);
    const bando = params.get('bando') as BandoType | null;
    if (bando && (bando === 'resto-al-sud-2-0' || bando === 'autoimpiego-centro-nord')) {
      setBandoType(bando);
      setBandoTitle(bando === 'resto-al-sud-2-0' ? 'Resto al Sud 2.0' : 'Autoimpiego Centro Nord');
    } else {
      // Fallback — redirect to avvio pratica
      router.replace('/dashboard/avviopratica');
    }
  }, [router]);

  const transitionTo = useCallback((target: Screen) => {
    setIsTransitioning(true);
    // Exit animation plays, then swap screen
    setTimeout(() => {
      setScreen(target);
      setIsTransitioning(false);
    }, 280);
  }, []);

  const handleStartUpload = useCallback(async () => {
    if (!bandoType) return;
    setError(null);
    try {
      const res = await fetch('/api/practices/pia/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bandoType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Errore avvio pratica');
        return;
      }
      setApplicationId(data.applicationId);
      setSubmissionId(data.submissionId);
      transitionTo('upload');
    } catch {
      setError('Errore di connessione. Riprova.');
    }
  }, [bandoType, transitionTo]);

  const handleUploadComplete = useCallback(() => {
    transitionTo('form');
  }, [transitionTo]);

  const handleFormComplete = useCallback(async (data: Record<string, unknown>) => {
    setFormData(data as unknown as PiaFormData);
    if (!applicationId) return;
    setError(null);
    try {
      const res = await fetch('/api/practices/pia/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, formData: data }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || 'Errore invio questionario');
        return;
      }
      transitionTo('celebration');
    } catch {
      setError('Errore di connessione. Riprova.');
    }
  }, [applicationId, transitionTo]);

  const handleViewPractice = useCallback(() => {
    if (applicationId) {
      router.push(`/dashboard/practices/${applicationId}`);
    }
  }, [applicationId, router]);

  const containerClass = `pia-flow-screen ${screen === screen ? 'active' : ''} ${isTransitioning ? 'screen-exit' : ''}`;

  return (
    <div className="pia-flow">
      {error && (
        <div className="pia-flow-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>X</button>
        </div>
      )}

      {screen === 'welcome' && (
        <div className={`pia-screen-inner ${isTransitioning ? 'screen-exit' : 'screen-enter'}`}>
          <PiaWelcome
            bandoTitle={bandoTitle}
            onStart={handleStartUpload}
          />
        </div>
      )}

      {screen === 'upload' && applicationId && (
        <div className={`pia-screen-inner ${isTransitioning ? 'screen-exit' : 'screen-enter'}`}>
          <PiaUpload
            applicationId={applicationId}
            onComplete={handleUploadComplete}
          />
        </div>
      )}

      {screen === 'form' && (
        <div className={`pia-screen-inner ${isTransitioning ? 'screen-exit' : 'screen-enter'}`}>
          <PiaFormWizard
            bandoTitle={bandoTitle}
            onComplete={handleFormComplete}
          />
        </div>
      )}

      {screen === 'celebration' && (
        <div className={`pia-screen-inner ${isTransitioning ? 'screen-exit' : 'screen-enter'}`}>
          <PiaCelebration
            bandoTitle={bandoTitle}
            onViewPractice={handleViewPractice}
          />
        </div>
      )}

      <style>{`
        .pia-flow {
          width: 100%;
          min-height: calc(100vh - 120px);
          display: flex;
          flex-direction: column;
          position: relative;
        }
        .pia-flow-error {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 1000;
          background: #FEE2E2;
          color: #DC2626;
          padding: 12px 18px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          animation: msgIn .3s ease;
        }
        .pia-flow-error button {
          background: none;
          border: none;
          color: #DC2626;
          cursor: pointer;
          font-weight: 700;
          font-size: 14px;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .pia-flow-error button:hover {
          background: rgba(220,38,38,0.1);
        }
        .pia-screen-inner {
          flex: 1;
          display: flex;
          flex-direction: column;
          width: 100%;
        }
        .pia-screen-inner.screen-enter {
          animation: screenIn .4s cubic-bezier(.16,1,.3,1);
        }
        .pia-screen-inner.screen-exit {
          animation: screenExit .28s ease both;
          pointer-events: none;
        }
        @keyframes screenIn {
          0%   { opacity: 0; transform: translateY(28px) scale(.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes screenExit {
          0%   { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-28px) scale(.95); }
        }
      `}</style>
    </div>
  );
}
