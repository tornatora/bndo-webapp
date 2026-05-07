'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Sparkles } from 'lucide-react';
import s from '../styles/compila-bando.module.css';

type Props = {
  onAccept: () => void;
  onDecline: () => void;
};

export function Step9OffertaAI({ onAccept, onDecline }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const modal = (
    <div className={s.cbModalBackdrop}>
      <div className={s.cbModal}>
        <div className={s.cbModalIcon}>
          <Bot size={28} />
        </div>

        <h2 className={s.cbModalTitle}>
          Vuoi compilare il bando con il nostro Agente AI?
        </h2>
        <p className={s.cbModalSubtitle}>
          L&apos;Agente AI inserirà automaticamente tutti i dati estratti nella
          domanda di candidatura su bndo.it. Dovrai solo fare il login con SPID
          e confermare &mdash; al resto pensiamo noi.
        </p>

        <div className={s.cbModalActions}>
          <button className={s.cbBtnGreen} onClick={onAccept} type="button">
            <Sparkles size={16} />
            Sì, usa l&apos;Agente AI
          </button>
          <button className={s.cbBtnMuted} onClick={onDecline} type="button">
            No, compilo manualmente
          </button>
        </div>
      </div>
    </div>
  );

  if (mounted) {
    return createPortal(modal, document.body);
  }

  return null;
}
