'use client';

import { Sparkles } from 'lucide-react';
import s from '../styles/compila-bando.module.css';

type Props = {
  onStart: () => void;
};

export function Step1Benvenuto({ onStart }: Props) {
  return (
    <div className={s.cbWelcome}>
      <div className={s.cbWelcomeBadge}>
        <Sparkles size={14} />
        Flusso Compilazione Bando
      </div>

      <h1 className={s.cbWelcomeTitle}>
        Benvenuto nel flusso di compilazione automatica BNDO
      </h1>
      <p className={s.cbWelcomeSubtitle}>
        Carica i tuoi documenti, estrai i dati aziendali e lascia che il nostro
        Agente AI compili automaticamente la domanda per il tuo bando.
      </p>

      <div className={s.cbWelcomePhases}>
        <div className={s.cbWelcomePhase}>
          <div className={s.cbWelcomePhaseNum}>1</div>
          <p className={s.cbWelcomePhaseLabel}>Carica Documenti</p>
        </div>
        <div className={s.cbWelcomePhase}>
          <div className={s.cbWelcomePhaseNum}>2</div>
          <p className={s.cbWelcomePhaseLabel}>Estrai &amp; Verifica Dati</p>
        </div>
        <div className={s.cbWelcomePhase}>
          <div className={s.cbWelcomePhaseNum}>3</div>
          <p className={s.cbWelcomePhaseLabel}>Compila &amp; Invia Domanda</p>
        </div>
      </div>

      <button className={s.cbBtnGreen} onClick={onStart} type="button">
        <Sparkles size={16} />
        Inizia il Flusso
      </button>
    </div>
  );
}
