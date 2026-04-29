'use client';

import { useState, useCallback, useRef } from 'react';
import type { WizardState, WizardStep, WizardDirection, UploadedFile, CustomField, SpidPhase, GeneratedDoc } from '../lib/types';
import { DEFAULT_EXTRACTED, INITIAL_EXTRACTED } from '../lib/demoData';

function makeInitialState(initialStep: WizardStep = 1): WizardState {
  const shouldSeedDemo = initialStep > 1;
  return {
    currentStep: initialStep,
    direction: 'next',
    useAiAgent: initialStep >= 10,
    files: shouldSeedDemo
      ? {
          visura: { name: 'visura-demo.pdf', size: 128000, type: 'application/pdf' },
          cartaIdentita: { name: 'carta-identita-demo.jpg', size: 48000, type: 'image/jpeg' },
          altri: [
            { name: 'Preventivo arredamento.pdf', size: 98000, type: 'application/pdf' },
            { name: 'Preventivo attrezzature.pdf', size: 112000, type: 'application/pdf' },
          ],
        }
      : { visura: null, cartaIdentita: null, altri: [] },
    extracted: shouldSeedDemo ? { ...DEFAULT_EXTRACTED } : INITIAL_EXTRACTED,
    customFields: shouldSeedDemo
      ? [
          { key: 'luogo_firma', value: 'Napoli' },
          { key: 'importo_programma', value: '75000' },
        ]
      : [],
    generatedPdfBlob: null,
    generatedDocxBlob: null,
    generatedDocs: [],
    docxStatus: 'generating',
    docxError: '',
    spidPhase: 'login',
    spidAuthenticated: false,
  };
}

export function useCompilaBandoWizard(initialStep: WizardStep = 1) {
  const [state, setState] = useState<WizardState>(() => makeInitialState(initialStep));
  const maxReachedRef = useRef<number>(initialStep);
  const step9LockRef = useRef(false);

  const goToStep = useCallback((step: WizardStep) => {
    setState((prev) => {
      if (step9LockRef.current && step < 10) return prev;
      const direction: WizardDirection = step > prev.currentStep ? 'next' : 'back';
      if (step >= 10) step9LockRef.current = true;
      if (step > maxReachedRef.current) maxReachedRef.current = step;
      return { ...prev, currentStep: step, direction };
    });
  }, []);

  const next = useCallback(() => {
    setState((prev) => {
      if (prev.currentStep >= 11) return prev;
      const step = (prev.currentStep + 1) as WizardStep;
      if (step >= 10) step9LockRef.current = true;
      if (step > maxReachedRef.current) maxReachedRef.current = step;
      return { ...prev, currentStep: step, direction: 'next' };
    });
  }, []);

  const back = useCallback(() => {
    setState((prev) => {
      if (prev.currentStep <= 1) return prev;
      const step = (prev.currentStep - 1) as WizardStep;
      if (step9LockRef.current && step < 10) return prev;
      return { ...prev, currentStep: step, direction: 'back' };
    });
  }, []);

  const setVisura = useCallback((file: UploadedFile | null) => {
    setState((prev) => ({ ...prev, files: { ...prev.files, visura: file } }));
  }, []);

  const setCartaIdentita = useCallback((file: UploadedFile | null) => {
    setState((prev) => ({ ...prev, files: { ...prev.files, cartaIdentita: file } }));
  }, []);

  const addAltroDocumento = useCallback((file: UploadedFile) => {
    setState((prev) => ({
      ...prev,
      files: { ...prev.files, altri: [...prev.files.altri, file] },
    }));
  }, []);

  const removeAltroDocumento = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      files: { ...prev.files, altri: prev.files.altri.filter((_, i) => i !== index) },
    }));
  }, []);

  const setExtracted = useCallback((data: typeof DEFAULT_EXTRACTED) => {
    setState((prev) => ({ ...prev, extracted: data }));
  }, []);

  const updateExtractedField = useCallback((key: string, value: string) => {
    setState((prev) => ({
      ...prev,
      extracted: { ...prev.extracted, [key]: value },
    }));
  }, []);

  const addCustomField = useCallback((field: CustomField) => {
    setState((prev) => ({
      ...prev,
      customFields: [...prev.customFields, field],
    }));
  }, []);

  const removeCustomField = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      customFields: prev.customFields.filter((_, i) => i !== index),
    }));
  }, []);

  const setUseAiAgent = useCallback((val: boolean) => {
    setState((prev) => ({ ...prev, useAiAgent: val }));
  }, []);

  const setGeneratedPdfBlob = useCallback((blob: Blob | null) => {
    setState((prev) => ({ ...prev, generatedPdfBlob: blob }));
  }, []);

  const setGeneratedDocxBlob = useCallback((blob: Blob | null) => {
    setState((prev) => ({ ...prev, generatedDocxBlob: blob }));
  }, []);

  const setGeneratedDocs = useCallback((docs: GeneratedDoc[]) => {
    setState((prev) => ({ ...prev, generatedDocs: docs }));
  }, []);

  const setDocxStatus = useCallback((status: 'generating' | 'ready' | 'error') => {
    setState((prev) => ({ ...prev, docxStatus: status }));
  }, []);

  const setDocxError = useCallback((error: string) => {
    setState((prev) => ({ ...prev, docxError: error }));
  }, []);

  const setSpidPhase = useCallback((phase: SpidPhase) => {
    setState((prev) => ({ ...prev, spidPhase: phase }));
  }, []);

  const setSpidAuthenticated = useCallback((val: boolean) => {
    setState((prev) => ({ ...prev, spidAuthenticated: val }));
  }, []);

  const skipUploads = useCallback(() => {
    setState((prev) => ({
      ...prev,
      extracted: { ...DEFAULT_EXTRACTED },
      files: {
        visura: { name: 'visura-demo.pdf', size: 128000, type: 'application/pdf' },
        cartaIdentita: { name: 'carta-identita-demo.jpg', size: 48000, type: 'image/jpeg' },
        altri: [],
      },
    }));
  }, []);

  const reset = useCallback(() => {
    setState(makeInitialState(initialStep));
    maxReachedRef.current = 1;
    step9LockRef.current = false;
  }, [initialStep]);

  return {
    state,
    maxReached: maxReachedRef.current,
    goToStep,
    next,
    back,
    setVisura,
    setCartaIdentita,
    addAltroDocumento,
    removeAltroDocumento,
    setExtracted,
    updateExtractedField,
    addCustomField,
    removeCustomField,
    setUseAiAgent,
    setGeneratedPdfBlob,
    setGeneratedDocxBlob,
    setGeneratedDocs,
    setDocxStatus,
    setDocxError,
    setSpidPhase,
    setSpidAuthenticated,
    skipUploads,
    reset,
  };
}
