'use client';

import { useState, useCallback, useRef } from 'react';
import type { WizardState, WizardStep, WizardDirection, UploadedFile, CustomField, SpidPhase } from '../lib/types';
import { DEFAULT_EXTRACTED, INITIAL_EXTRACTED } from '../lib/demoData';

function makeInitialState(): WizardState {
  return {
    currentStep: 1,
    direction: 'next',
    useAiAgent: false,
    files: { visura: null, cartaIdentita: null, altri: [] },
    extracted: INITIAL_EXTRACTED,
    customFields: [],
    generatedPdfBlob: null,
    generatedDocxBlob: null,
    spidPhase: 'login',
    spidAuthenticated: false,
  };
}

export function useCompilaBandoWizard() {
  const [state, setState] = useState<WizardState>(makeInitialState);
  const maxReachedRef = useRef<number>(1);
  const step9LockRef = useRef(false);

  const goToStep = useCallback((step: WizardStep) => {
    setState((prev) => {
      if (step9LockRef.current && step < 9) return prev;
      const direction: WizardDirection = step > prev.currentStep ? 'next' : 'back';
      if (step >= 9) step9LockRef.current = true;
      if (step > maxReachedRef.current) maxReachedRef.current = step;
      return { ...prev, currentStep: step, direction };
    });
  }, []);

  const next = useCallback(() => {
    setState((prev) => {
      if (prev.currentStep >= 10) return prev;
      const step = (prev.currentStep + 1) as WizardStep;
      if (step >= 9) step9LockRef.current = true;
      if (step > maxReachedRef.current) maxReachedRef.current = step;
      return { ...prev, currentStep: step, direction: 'next' };
    });
  }, []);

  const back = useCallback(() => {
    setState((prev) => {
      if (prev.currentStep <= 1) return prev;
      const step = (prev.currentStep - 1) as WizardStep;
      if (step9LockRef.current && step < 9) return prev;
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
    setState(makeInitialState());
    maxReachedRef.current = 1;
    step9LockRef.current = false;
  }, []);

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
    setSpidPhase,
    setSpidAuthenticated,
    skipUploads,
    reset,
  };
}
