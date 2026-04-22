'use client';

import { useState, useCallback } from 'react';
import { PdfUploader } from './PdfUploader';
import { ExtractedForm } from './ExtractedForm';
import { CustomFieldBuilder } from './CustomFieldBuilder';
import type { ExtractedData, CustomField } from '../lib/types';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function EstrattoreClient({ userId }: { userId: string }) {
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleExtracted = useCallback((data: ExtractedData) => {
    setExtracted(data);
    setCustomFields([]);
    setSaveStatus('idle');
    setSaveError(null);
  }, []);

  const handleReset = useCallback(() => {
    setExtracted(null);
    setCustomFields([]);
    setSaveStatus('idle');
    setSaveError(null);
  }, []);

  const handleAddCustomField = useCallback((field: CustomField) => {
    setCustomFields((prev) => [...prev, field]);
  }, []);

  const handleRemoveCustomField = useCallback((index: number) => {
    setCustomFields((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = useCallback(
    async (formData: ExtractedData) => {
      setSaveStatus('saving');
      setSaveError(null);
      try {
        const res = await fetch('/api/estrattore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            extracted_data: formData,
            custom_fields: customFields,
          }),
        });
        const json = await res.json();
        if (!res.ok || json.error) {
          throw new Error(json.error || 'Errore durante il salvataggio.');
        }
        setSaveStatus('saved');
      } catch (e) {
        setSaveStatus('error');
        setSaveError(e instanceof Error ? e.message : 'Errore sconosciuto.');
      }
    },
    [userId, customFields]
  );

  return (
    <div className="space-y-8">
      {!extracted ? (
        <PdfUploader onExtracted={handleExtracted} />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <button
              onClick={handleReset}
              className="rounded-xl border border-[#d7e2f2] bg-white px-4 py-2 text-sm font-semibold text-[#24395a] transition hover:border-[#b6c7df]"
            >
              Carica un altro PDF
            </button>
            {saveStatus === 'saved' && (
              <span className="text-sm font-semibold text-green-600">Salvato con successo</span>
            )}
          </div>

          <ExtractedForm
            initialData={extracted}
            onSave={handleSave}
            saveStatus={saveStatus}
            saveError={saveError}
          />

          <CustomFieldBuilder
            fields={customFields}
            onAdd={handleAddCustomField}
            onRemove={handleRemoveCustomField}
          />
        </>
      )}
    </div>
  );
}
