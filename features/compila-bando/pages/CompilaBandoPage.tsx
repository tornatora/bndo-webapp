'use client';

import { useCallback } from 'react';
import { useCompilaBandoWizard } from '../hooks/useCompilaBandoWizard';
import { CompilaBandoLayout } from '../layouts/CompilaBandoLayout';
import { Step1Benvenuto } from '../components/Step1Benvenuto';
import { Step2UploadVisura } from '../components/Step2UploadVisura';
import { Step3UploadCartaIdentita } from '../components/Step3UploadCartaIdentita';
import { Step4AltriDocumenti } from '../components/Step4AltriDocumenti';
import { Step5Estrazione } from '../components/Step5Estrazione';
import { Step6RevisioneDati } from '../components/Step6RevisioneDati';
import { Step7CompilazioneDoc } from '../components/Step7CompilazioneDoc';
import { Step8DocumentiDSAN } from '../components/Step8DocumentiDSAN';
import { Step9OffertaAI } from '../components/Step9OffertaAI';
import { Step10BrowserBando } from '../components/Step10BrowserBando';
import { Step11ConfermaFinale } from '../components/Step11ConfermaFinale';
import { DEFAULT_EXTRACTED } from '../lib/demoData';
import type { WizardStep } from '../lib/types';
import { useRouter } from 'next/navigation';

type Props = {
  initialStep?: WizardStep;
};

export function CompilaBandoPage({ initialStep = 1 }: Props) {
  const router = useRouter();
  const wiz = useCompilaBandoWizard(initialStep);
  const { state } = wiz;

  const handleSkipUploads = useCallback(() => {
    wiz.skipUploads();
    // Advance 3 steps to extraction
    wiz.goToStep(5);
  }, [wiz]);

  const handleExtractionComplete = useCallback(
    (data: typeof DEFAULT_EXTRACTED) => {
      wiz.setExtracted(data);
      setTimeout(() => wiz.goToStep(6), 1500);
    },
    [wiz]
  );

  const handleBackToDashboard = useCallback(() => {
    router.push('/dashboard/pratiche');
  }, [router]);

  // Special navigation logic for steps that auto-advance
  const handleNext = useCallback(() => {
    // Step 9: If user chooses "No" for AI agent, skip to step 11
    if (state.currentStep === 9 && !state.useAiAgent) {
      wiz.goToStep(11);
      return;
    }
    wiz.next();
  }, [state.currentStep, state.useAiAgent, wiz]);

  const handleBack = useCallback(() => {
    wiz.back();
  }, [wiz]);

  const renderStep = () => {
    switch (state.currentStep) {
      case 1:
        return <Step1Benvenuto onStart={() => wiz.goToStep(2)} />;

      case 2:
        return (
          <Step2UploadVisura
            file={state.files.visura}
            onFile={wiz.setVisura}
            onSkip={handleSkipUploads}
          />
        );

      case 3:
        return (
          <Step3UploadCartaIdentita
            file={state.files.cartaIdentita}
            onFile={wiz.setCartaIdentita}
          />
        );

      case 4:
        return (
          <Step4AltriDocumenti
            files={state.files.altri}
            onAdd={wiz.addAltroDocumento}
            onRemove={wiz.removeAltroDocumento}
          />
        );

      case 5:
        return (
          <Step5Estrazione
            onComplete={handleExtractionComplete}
            demoData={DEFAULT_EXTRACTED}
            visura={state.files.visura}
            cartaIdentita={state.files.cartaIdentita}
          />
        );

      case 6:
        return (
          <Step6RevisioneDati
            extracted={state.extracted}
            customFields={state.customFields}
            onChangeField={wiz.updateExtractedField}
            onAddCustomField={wiz.addCustomField}
            onRemoveCustomField={wiz.removeCustomField}
          />
        );

      case 7:
        return (
          <Step7CompilazioneDoc
            extracted={state.extracted}
            customFields={state.customFields}
            otherFiles={state.files.altri}
            onPdfBlob={wiz.setGeneratedPdfBlob}
            onGeneratedDocs={wiz.setGeneratedDocs}
            onDsanStatus={wiz.setDsanStatus}
            onDsanError={wiz.setDsanError}
          />
        );

      case 8:
        return (
          <Step8DocumentiDSAN
            generatedDocs={state.generatedDocs.length > 0 ? state.generatedDocs : [
              { key: 'dsan_antiriciclaggio', fileName: 'DSAN_Antiriciclaggio.pdf', mimeType: 'application/pdf' },
              { key: 'dsan_casellario_liquidatorie', fileName: 'DSAN_Casellario.pdf', mimeType: 'application/pdf' },
              { key: 'dsan_requisiti_iniziativa', fileName: 'DSAN_Requisiti_Iniziativa.pdf', mimeType: 'application/pdf' },
              { key: 'dsan_requisiti_soggettivi', fileName: 'DSAN_Requisiti_Soggettivi.pdf', mimeType: 'application/pdf' },
              { key: 'descrizione_iniziativa_c2', fileName: 'Descrizione_Iniziativa_C2.pdf', mimeType: 'application/pdf' },
            ]}
            dsanStatus={state.dsanStatus}
            dsanError={state.dsanError}
          />
        );

      case 9:
        return (
          <Step9OffertaAI
            onAccept={() => {
              wiz.setUseAiAgent(true);
              wiz.goToStep(10);
            }}
            onDecline={() => {
              wiz.setUseAiAgent(false);
              wiz.goToStep(11);
            }}
          />
        );

      case 10:
        return (
          <Step10BrowserBando
            extracted={state.extracted}
            customFields={state.customFields}
            spidAuthenticated={state.spidAuthenticated}
            onSpidLogin={() => wiz.setSpidAuthenticated(true)}
            onComplete={() => wiz.goToStep(11)}
          />
        );

      case 11:
        return (
          <Step11ConfermaFinale
            extracted={state.extracted}
            customFields={state.customFields}
            hasPdf={state.generatedPdfBlob !== null}
            hasDsan={state.generatedDocs.length > 0 && state.dsanStatus === 'ready'}
            useAiAgent={state.useAiAgent}
            onBackToDashboard={handleBackToDashboard}
          />
        );

      default:
        return null;
    }
  };

  // Determine if footer should be hidden
  const hideFooter =
    state.currentStep === 5 ||
    state.currentStep === 9 ||
    state.currentStep === 10 ||
    state.currentStep === 11;

  return (
    <CompilaBandoLayout
      state={state}
      maxReached={wiz.maxReached}
      onNext={handleNext}
      onBack={handleBack}
      hideFooter={hideFooter}
      canGoNext={state.currentStep === 2 ? !!state.files.visura : state.currentStep === 3 ? !!state.files.cartaIdentita : true}
    >
      {renderStep()}
    </CompilaBandoLayout>
  );
}
