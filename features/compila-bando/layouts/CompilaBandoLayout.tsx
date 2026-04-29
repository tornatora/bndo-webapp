'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import type { WizardState, WizardStep } from '../lib/types';
import s from '../styles/compila-bando.module.css';

type Props = {
  state: WizardState;
  maxReached: number;
  onNext: () => void;
  onBack: () => void;
  children: React.ReactNode;
  hideFooter?: boolean;
  canGoNext?: boolean;
};

function StepDot({ step, status }: { step: number; status: 'completed' | 'active' | 'upcoming' }) {
  return (
    <div className={`${s.cbProgressDot} ${s[`cbProgressDot${status.charAt(0).toUpperCase() + status.slice(1)}`]}`}>
      {status === 'completed' ? <Check size={10} strokeWidth={3} /> : step}
    </div>
  );
}

export function CompilaBandoLayout({ state, maxReached, onNext, onBack, children, hideFooter, canGoNext = true }: Props) {
  const { currentStep, direction } = state;
  const isFirst = currentStep === 1;
  const isLast = currentStep === 11;

  const stepStatus = (step: WizardStep): 'completed' | 'active' | 'upcoming' => {
    if (step < currentStep) return 'completed';
    if (step === currentStep) return 'active';
    return 'upcoming';
  };

  return (
    <div className={s.cbShell}>
      {/* Topbar */}
      <div className={s.cbTopbar}>
        <div className={s.cbTopbarLeft}>
          <span className={s.cbTopbarLogo}>BNDO</span>
        </div>
        <div className={s.cbTopbarCenter}>
          <div className={s.cbStepBadge}>
            <span>Step {currentStep}/10</span>
          </div>
        </div>
        <div className={s.cbTopbarRight}>
          <div className={s.cbUserAvatar}>U</div>
        </div>
      </div>

      {/* Progress dots */}
      <div className={s.cbProgressWrap}>
        <div className={s.cbProgressTrack}>
          <div
            className={s.cbProgressFill}
            style={{ width: `${(currentStep / 10) * 100}%` }}
          />
        </div>
        <div className={s.cbProgressSteps}>
          {([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as WizardStep[]).map((s) => (
            <StepDot key={s} step={s} status={stepStatus(s)} />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className={s.cbContent}>
        <div className={s.cbContentInner}>
          <div className={s.cbStepWrapper} data-direction={direction} key={currentStep}>
            {children}
          </div>
        </div>
      </div>

      {/* Footer */}
      {!hideFooter && (
        <div className={s.cbFooter}>
          <div>
            {!isFirst && (
              <button className={s.cbBtnMuted} onClick={onBack} type="button">
                <ChevronLeft size={16} />
                Indietro
              </button>
            )}
          </div>
          <div className={s.cbFooterRight}>
            {!isLast && (
              <button className={s.cbBtnPrimary} onClick={onNext} type="button" disabled={!canGoNext}>
                Avanti
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
