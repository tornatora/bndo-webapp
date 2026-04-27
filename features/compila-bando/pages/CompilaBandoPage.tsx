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
import { Step8OffertaAI } from '../components/Step8OffertaAI';
import { Step9BrowserBando } from '../components/Step9BrowserBando';
import { Step10ConfermaFinale } from '../components/Step10ConfermaFinale';
import { DEFAULT_EXTRACTED } from '../lib/demoData';
import { useRouter } from 'next/navigation';

export function CompilaBandoPage() {
  const router = useRouter();
  const wiz = useCompilaBandoWizard();
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
    // Step 8: If user chooses "No" for AI agent, skip to step 10
    if (state.currentStep === 8 && !state.useAiAgent) {
      wiz.goToStep(10);
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
            onPdfBlob={wiz.setGeneratedPdfBlob}
            onDocxBlob={wiz.setGeneratedDocxBlob}
          />
        );

      case 8:
        return (
          <Step8OffertaAI
            onAccept={() => {
              wiz.setUseAiAgent(true);
              wiz.goToStep(9);
            }}
            onDecline={() => {
              wiz.setUseAiAgent(false);
              wiz.goToStep(10);
            }}
          />
        );

      case 9:
        return (
          <Step9BrowserBando
            extracted={state.extracted}
            spidAuthenticated={state.spidAuthenticated}
            onSpidLogin={() => wiz.setSpidAuthenticated(true)}
            onComplete={() => wiz.goToStep(10)}
          />
        );

      case 10:
        return (
          <Step10ConfermaFinale
            extracted={state.extracted}
            customFields={state.customFields}
            hasPdf={state.generatedPdfBlob !== null}
            hasDocx={state.generatedDocxBlob !== null}
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
    state.currentStep === 8 ||
    state.currentStep === 9 ||
    state.currentStep === 10;

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
