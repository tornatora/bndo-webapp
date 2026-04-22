'use client';

import { useState, useCallback, FormEvent } from 'react';
import { Plus, Trash2, ListPlus } from 'lucide-react';
import type { CustomField } from '../lib/types';

export function CustomFieldBuilder({
  fields,
  onAdd,
  onRemove,
}: {
  fields: CustomField[];
  onAdd: (field: CustomField) => void;
  onRemove: (index: number) => void;
}) {
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!label.trim()) return;
      onAdd({ label: label.trim(), value: value.trim() });
      setLabel('');
      setValue('');
    },
    [label, value, onAdd]
  );

  return (
    <div className="rounded-2xl border border-[#e8ecf4] bg-white p-5 shadow-[0_2px_12px_rgba(11,17,54,0.04)] md:p-6">
      <div className="mb-5 flex items-center gap-2">
        <ListPlus className="h-5 w-5 text-[#0f1f52]" />
        <h2 className="text-base font-bold text-[#0b1136]">Campi personalizzati</h2>
      </div>

      {fields.length > 0 && (
        <ul className="mb-5 space-y-2">
          {fields.map((f, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-xl border border-[#e8ecf4] bg-[#fafbfc] px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#5f7388]">{f.label}</p>
                <p className="truncate text-sm text-[#0b1136]">{f.value || <span className="text-[#94a3b8]">—</span>}</p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="ml-3 rounded-lg p-1.5 text-[#64748b] transition hover:bg-red-50 hover:text-red-600"
                title="Rimuovi"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#5f7388]">
            Nome campo
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Es. Capitale sociale"
            className="w-full rounded-xl border border-[#d7e2f2] bg-white px-3.5 py-2.5 text-sm text-[#0b1136] outline-none transition placeholder:text-[#94a3b8] focus:border-[#0f1f52] focus:ring-1 focus:ring-[#0f1f52]"
          />
        </div>
        <div className="flex-[2]">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#5f7388]">
            Valore
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Es. 10.000 €"
            className="w-full rounded-xl border border-[#d7e2f2] bg-white px-3.5 py-2.5 text-sm text-[#0b1136] outline-none transition placeholder:text-[#94a3b8] focus:border-[#0f1f52] focus:ring-1 focus:ring-[#0f1f52]"
          />
        </div>
        <button
          type="submit"
          disabled={!label.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0f1f52] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#122963] disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          Aggiungi
        </button>
      </form>
    </div>
  );
}
