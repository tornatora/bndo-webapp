'use client';

import React from 'react';
import { MessageSquare, Search } from 'lucide-react';
import styles from './OnboardingChoiceView.module.css';

type Props = {
  onStartChat: () => void;
  onOpenScanner: () => void;
};

export function OnboardingChoiceView({ onStartChat, onOpenScanner }: Props) {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Come vuoi procedere?</h1>
      
      <div className={styles.choiceGrid}>
        <div className={styles.card} onClick={onStartChat}>
          <div className={styles.iconWrapper}>
            <MessageSquare size={32} />
          </div>
          <h2 className={styles.cardTitle}>Chat AI (Consulente)</h2>
          <p className={styles.cardDesc}>
            Parla con il nostro assistente per descrivere la tua idea e trovare i bandi più adatti a te.
          </p>
          <button type="button" className={styles.btn}>Inizia Chat</button>
        </div>

        <div className={styles.card} onClick={onOpenScanner}>
          <div className={styles.iconWrapper}>
            <Search size={32} />
          </div>
          <h2 className={styles.cardTitle}>Scanner Bandi (Database)</h2>
          <p className={styles.cardDesc}>
            Esplora manualmente il nostro database completo di bandi filtrando per categoria e requisiti.
          </p>
          <button type="button" className={styles.btn}>Apri Scanner</button>
        </div>
      </div>
    </div>
  );
}
