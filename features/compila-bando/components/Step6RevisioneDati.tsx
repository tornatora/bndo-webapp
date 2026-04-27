'use client';

import { useState, useCallback } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { FORM_FIELDS } from '../lib/demoData';
import type { ExtractedData, CustomField } from '../lib/types';
import s from '../styles/compila-bando.module.css';

type Props = {
  extracted: ExtractedData;
  customFields: CustomField[];
  onChangeField: (key: string, value: string) => void;
  onAddCustomField: (field: CustomField) => void;
  onRemoveCustomField: (index: number) => void;
};

export function Step6RevisioneDati({
  extracted,
  customFields,
  onChangeField,
  onAddCustomField,
  onRemoveCustomField,
}: Props) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const filledFields = FORM_FIELDS.filter((f) => extracted[f.key]);
  const emptyFields = FORM_FIELDS.filter((f) => !extracted[f.key]);

  const handleAddCustom = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!newKey.trim()) return;
      onAddCustomField({ key: newKey.trim(), value: newValue.trim() });
      setNewKey('');
      setNewValue('');
    },
    [newKey, newValue, onAddCustomField]
  );

  return (
    <div>
      <h2 className={s.cbCardTitle} style={{ marginBottom: 4 }}>
        Revisione Dati Estratti
      </h2>
      <p className={s.cbCardSubtitle} style={{ marginBottom: 24 }}>
        Verifica i dati estratti dai documenti e compila i campi mancanti.
      </p>

      <div className={s.cbTwoCol}>
        {/* Extracted data — read only overview */}
        <div>
          <div className={s.cbCard} style={{ marginBottom: 16 }}>
            <h3
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#16a34a',
                margin: '0 0 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Check size={16} />
              Dati Estratti ({filledFields.length})
            </h3>
            {filledFields.map((f) => (
              <div
                key={f.key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 0',
                  borderBottom: '1px solid rgba(11,17,54,0.04)',
                  fontSize: 13,
                }}
              >
                <span style={{ color: '#5f7388', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>
                  {f.label}
                </span>
                <span style={{ color: '#0b1136', fontWeight: 500 }}>{extracted[f.key]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Missing / editable */}
        <div>
          <div className={s.cbCard}>
            <h3
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#0b1136',
                margin: '0 0 16px',
              }}
            >
              Informazioni da completare
            </h3>

            {FORM_FIELDS.map((f) => (
              <div key={f.key} className={s.cbField}>
                <label className={s.cbLabel}>{f.label}</label>
                <input
                  className={s.cbInput}
                  type="text"
                  value={extracted[f.key]}
                  onChange={(e) => onChangeField(f.key, e.target.value)}
                  placeholder={f.placeholder}
                />
              </div>
            ))}

            {/* Custom fields */}
            {customFields.map((cf, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-end',
                  marginBottom: 12,
                }}
              >
                <div style={{ flex: 1 }}>
                  <label className={s.cbLabel}>{cf.key}</label>
                  <input
                    className={s.cbInput}
                    value={cf.value}
                    onChange={(e) => {
                      const updated = [...customFields];
                      updated[i] = { ...updated[i], value: e.target.value };
                      onRemoveCustomField(i);
                      onAddCustomField(updated[i]);
                    }}
                  />
                </div>
                <button
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: 8,
                  }}
                  onClick={() => onRemoveCustomField(i)}
                  type="button"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            {/* Add custom field */}
            <div className={s.cbCustomFieldForm}>
              <form onSubmit={handleAddCustom}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label className={s.cbLabel}>Nome campo</label>
                    <input
                      className={s.cbInput}
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      placeholder="Es. Capitale sociale"
                    />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label className={s.cbLabel}>Valore</label>
                    <input
                      className={s.cbInput}
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      placeholder="Es. 10.000 €"
                    />
                  </div>
                  <button
                    className={s.cbBtnPrimary}
                    type="submit"
                    disabled={!newKey.trim()}
                    style={{ minHeight: 42, padding: '0 16px' }}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
