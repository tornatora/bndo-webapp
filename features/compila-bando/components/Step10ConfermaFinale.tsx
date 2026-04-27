'use client';

import { useEffect } from 'react';
import { Check, FileText, ArrowLeft } from 'lucide-react';
import { useConfetti } from '../hooks/useConfetti';
import type { ExtractedData, CustomField } from '../lib/types';
import s from '../styles/compila-bando.module.css';

type Props = {
  extracted: ExtractedData;
  customFields: CustomField[];
  hasPdf: boolean;
  hasDocx: boolean;
  useAiAgent: boolean;
  onBackToDashboard: () => void;
};

export function Step10ConfermaFinale({
  extracted,
  customFields,
  hasPdf,
  hasDocx,
  useAiAgent,
  onBackToDashboard,
}: Props) {
  const { launch } = useConfetti();

  useEffect(() => {
    const t = setTimeout(launch, 300);
    return () => clearTimeout(t);
  }, [launch]);

  const filledFields =
    Object.values(extracted).filter(Boolean).length + customFields.length;
  const totalDocs = (hasPdf ? 1 : 0) + (hasDocx ? 1 : 0);

  const timestamp = new Date().toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={s.cbSuccessWrap}>
      <div className={s.cbSuccessCheck}>
        <Check size={36} strokeWidth={3} />
      </div>

      <h1 className={s.cbSuccessTitle}>Domanda Inviata con Successo!</h1>
      <p className={s.cbSuccessSubtitle}>
        {useAiAgent
          ? "L'Agente AI ha compilato e inviato la domanda. Ecco il riepilogo."
          : 'Hai completato la compilazione. Ecco il riepilogo.'}
      </p>

      <div className={s.cbSuccessSummary}>
        <h3 className={s.cbSuccessSummaryTitle}>Riepilogo</h3>

        <div className={s.cbSuccessSummaryRow}>
          <span className={s.cbSuccessSummaryLabel}>Data invio</span>
          <span className={s.cbSuccessSummaryValue}>{timestamp}</span>
        </div>
        <div className={s.cbSuccessSummaryRow}>
          <span className={s.cbSuccessSummaryLabel}>Campi compilati</span>
          <span className={s.cbSuccessSummaryValue}>{filledFields}</span>
        </div>
        <div className={s.cbSuccessSummaryRow}>
          <span className={s.cbSuccessSummaryLabel}>Documenti generati</span>
          <span className={s.cbSuccessSummaryValue}>{totalDocs}</span>
        </div>
        <div className={s.cbSuccessSummaryRow}>
          <span className={s.cbSuccessSummaryLabel}>Agente AI</span>
          <span className={s.cbSuccessSummaryValue}>
            {useAiAgent ? 'Utilizzato' : 'Non utilizzato'}
          </span>
        </div>
        <div className={s.cbSuccessSummaryRow}>
          <span className={s.cbSuccessSummaryLabel}>Login SPID</span>
          <span className={s.cbSuccessSummaryValue}>
            {useAiAgent ? 'Completato' : 'Non necessario'}
          </span>
        </div>
      </div>

      <button className={s.cbBtnPrimary} onClick={onBackToDashboard} type="button">
        <ArrowLeft size={16} />
        Torna alla Dashboard
      </button>
    </div>
  );
}
