import type { OnboardingWizardStepConfig } from '@/components/landing/onboarding-wizard/types';

export const ONBOARDING_STEPS: OnboardingWizardStepConfig[] = [
  {
    id: 1,
    title: 'Pagamento',
    description: 'Completa il pagamento per avviare la pratica',
  },
  {
    id: 2,
    title: 'Benvenuto',
    description: 'Conferma l’avvio della tua pratica',
  },
  {
    id: 3,
    title: 'Account dashboard',
    description: 'Crea le credenziali per accedere alla dashboard',
  },
  {
    id: 4,
    title: 'PEC e Firma Digitale',
    description: 'Inserisci PEC e firma digitale',
  },
  {
    id: 5,
    title: 'Documenti obbligatori',
    description: 'Carica i documenti richiesti',
  },
  {
    id: 6,
    title: 'Preventivi',
    description: 'Inserisci i preventivi necessari',
  },
  {
    id: 7,
    title: 'Conferme finali',
    description: 'Accetta consensi e conferma finale',
  },
];
