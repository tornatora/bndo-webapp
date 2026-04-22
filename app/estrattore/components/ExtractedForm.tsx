'use client';

import { useState, useCallback, FormEvent } from 'react';
import { Loader2, Save, FileText } from 'lucide-react';
import type { ExtractedData } from '../lib/types';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const FIELDS: { key: keyof ExtractedData; label: string; placeholder: string }[] = [
  { key: 'ragione_sociale', label: 'Ragione Sociale', placeholder: 'Es. Rossi S.r.l.' },
  { key: 'sede_legale', label: 'Sede Legale', placeholder: 'Es. Via Roma 1, 00100 Roma (RM)' },
  { key: 'codice_fiscale', label: 'Codice Fiscale', placeholder: 'Es. RSSMRA85T10A794S' },
  { key: 'partita_iva', label: 'Partita IVA', placeholder: 'Es. 12345678901' },
  { key: 'rea', label: 'REA', placeholder: 'Es. RM – 123456' },
  { key: 'forma_giuridica', label: 'Forma Giuridica', placeholder: 'Es. Società a responsabilità limitata' },
];

export function ExtractedForm({
  initialData,
  onSave,
  saveStatus,
  saveError,
}: {
  initialData: ExtractedData;
  onSave: (data: ExtractedData) => Promise<void>;
  saveStatus: SaveStatus;
  saveError: string | null;
}) {
  const [form, setForm] = useState<ExtractedData>(initialData);

  const update = useCallback((key: keyof ExtractedData, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      onSave(form);
    },
    [form, onSave]
  );

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-[#e8ecf4] bg-white p-5 shadow-[0_2px_12px_rgba(11,17,54,0.04)] md:p-6">
      <div className="mb-5 flex items-center gap-2">
        <FileText className="h-5 w-5 text-[#0f1f52]" />
        <h2 className="text-base font-bold text-[#0b1136]">Dati estratti</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {FIELDS.map(({ key, label, placeholder }) => (
          <div key={key} className="flex flex-col gap-1.5">
            <label htmlFor={key} className="text-xs font-semibold uppercase tracking-wide text-[#5f7388]">
              {label}
            </label>
            <input
              id={key}
              type="text"
              value={form[key] ?? ''}
              onChange={(e) => update(key, e.target.value)}
              placeholder={placeholder}
              className="rounded-xl border border-[#d7e2f2] bg-white px-3.5 py-2.5 text-sm text-[#0b1136] outline-none transition placeholder:text-[#94a3b8] focus:border-[#0f1f52] focus:ring-1 focus:ring-[#0f1f52]"
            />
          </div>
        ))}
      </div>

      {saveError && (
        <p className="mt-4 text-sm text-red-600">{saveError}</p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={saveStatus === 'saving'}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0f1f52] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#122963] disabled:opacity-60"
        >
          {saveStatus === 'saving' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saveStatus === 'saving' ? 'Salvataggio…' : 'Salva nel database'}
        </button>
        {saveStatus === 'saved' && (
          <span className="text-sm font-medium text-green-600">Salvato</span>
        )}
      </div>
    </form>
  );
}
