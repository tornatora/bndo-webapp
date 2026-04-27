'use client';

import type { SupplementalData } from '../lib/types';

type Option<T extends string> = {
  value: T;
  label: string;
};

function OptionChecks<T extends string>({
  value,
  onChange,
  options,
  name,
}: {
  value: T | '';
  onChange: (next: T | '') => void;
  options: Option<T>[];
  name: string;
}) {
  return (
    <div className="grid gap-2">
      {options.map((opt) => {
        const checked = value === opt.value;
        return (
          <label key={opt.value} className="inline-flex items-center gap-2 text-sm text-[#24395a]">
            <input
              type="checkbox"
              name={name}
              checked={checked}
              onChange={() => onChange(checked ? '' : opt.value)}
              className="h-4 w-4 rounded border-[#c8d3e3] text-[#0f1f52]"
            />
            <span>{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wide text-[#5f7388]">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-xl border border-[#d7e2f2] bg-white px-3.5 py-2.5 text-sm text-[#0b1136] outline-none transition placeholder:text-[#94a3b8] focus:border-[#0f1f52] focus:ring-1 focus:ring-[#0f1f52]"
      />
    </div>
  );
}

export function SupplementalFieldsForm({
  value,
  onChange,
}: {
  value: SupplementalData;
  onChange: (next: SupplementalData) => void;
}) {
  const setField = <K extends keyof SupplementalData>(key: K, next: SupplementalData[K]) => {
    onChange({ ...value, [key]: next });
  };

  return (
    <div className="rounded-2xl border border-[#e8ecf4] bg-white p-5 shadow-[0_2px_12px_rgba(11,17,54,0.04)] md:p-6">
      <h2 className="text-base font-bold text-[#0b1136]">Dati non ricavabili da documenti (compilazione guidata)</h2>
      <p className="mt-1 text-sm text-[#64748b]">Compila i campi mancanti e seleziona le opzioni con check (X).</p>

      <div className="mt-5 space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[#0f1f52]">Residenza dichiarante</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <TextInput label="Comune residenza" value={value.residenza_comune} onChange={(v) => setField('residenza_comune', v)} />
            <TextInput label="Provincia residenza (sigla)" value={value.residenza_provincia} onChange={(v) => setField('residenza_provincia', v)} placeholder="Es. TO" />
            <TextInput label="Via/Piazza residenza" value={value.residenza_via} onChange={(v) => setField('residenza_via', v)} />
            <TextInput label="Numero civico" value={value.residenza_civico} onChange={(v) => setField('residenza_civico', v)} />
            <TextInput label="CAP residenza" value={value.residenza_cap} onChange={(v) => setField('residenza_cap', v)} />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[#0f1f52]">DSAN Iniziativa economica</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <TextInput label="Sede operativa - Comune" value={value.sede_operativa_comune} onChange={(v) => setField('sede_operativa_comune', v)} />
            <TextInput label="Sede operativa - Provincia" value={value.sede_operativa_provincia} onChange={(v) => setField('sede_operativa_provincia', v)} placeholder="Es. TO" />
          </div>
          <TextInput
            label="Variazioni assetto societario/organo amministrativo"
            value={value.variazioni_assetto}
            onChange={(v) => setField('variazioni_assetto', v)}
            placeholder="Se non ci sono variazioni, scrivi: Nessuna variazione"
          />
          <TextInput
            label="Aiuti de minimis (riepilogo libero: tipologia, data, importo)"
            value={value.deminimis_note}
            onChange={(v) => setField('deminimis_note', v)}
            placeholder="Se assenti, scrivi: Nessun aiuto de minimis"
          />
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[#0f1f52]">DSAN Requisiti soggettivi (check una voce)</h3>
          <OptionChecks
            name="soggettivi_stato"
            value={value.soggettivi_stato}
            onChange={(v) => setField('soggettivi_stato', v)}
            options={[
              { value: 'inoccupato', label: 'Inoccupato / inattivo / disoccupato' },
              { value: 'gol', label: 'Disoccupato GOL' },
              { value: 'working_poor', label: 'Working poor' },
            ]}
          />
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[#0f1f52]">DSAN Casellario</h3>
          <p className="text-xs text-[#64748b]">Ruolo firmatario (check una voce)</p>
          <OptionChecks
            name="casellario_ruolo"
            value={value.casellario_ruolo}
            onChange={(v) => setField('casellario_ruolo', v)}
            options={[
              { value: 'titolare', label: 'Titolare' },
              { value: 'legale_rappresentante', label: 'Legale rappresentante' },
              { value: 'amministratore', label: 'Amministratore / componente CDA' },
              { value: 'titolare_effettivo', label: 'Titolare effettivo' },
              { value: 'altro', label: 'Altro' },
            ]}
          />
          {value.casellario_ruolo === 'altro' && (
            <TextInput label="Specifica altro ruolo" value={value.casellario_altro_ruolo} onChange={(v) => setField('casellario_altro_ruolo', v)} />
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#5f7388]">Condanne penali</p>
              <OptionChecks
                name="casellario_condanne"
                value={value.casellario_condanne}
                onChange={(v) => setField('casellario_condanne', v)}
                options={[
                  { value: 'no', label: 'No' },
                  { value: 'si', label: 'Sì' },
                ]}
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#5f7388]">Misure di prevenzione</p>
              <OptionChecks
                name="casellario_prevenzione"
                value={value.casellario_prevenzione}
                onChange={(v) => setField('casellario_prevenzione', v)}
                options={[
                  { value: 'no', label: 'No' },
                  { value: 'si', label: 'Sì' },
                ]}
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#5f7388]">Procedure esecutive/concorsuali</p>
              <OptionChecks
                name="casellario_procedure"
                value={value.casellario_procedure}
                onChange={(v) => setField('casellario_procedure', v)}
                options={[
                  { value: 'no', label: 'No' },
                  { value: 'si', label: 'Sì' },
                ]}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <TextInput
              label="Estremi condanne (se Sì)"
              value={value.casellario_condanne_estremi}
              onChange={(v) => setField('casellario_condanne_estremi', v)}
            />
            <TextInput
              label="Estremi misure prevenzione (se Sì)"
              value={value.casellario_prevenzione_estremi}
              onChange={(v) => setField('casellario_prevenzione_estremi', v)}
            />
            <TextInput
              label="Estremi procedure (se Sì)"
              value={value.casellario_procedure_estremi}
              onChange={(v) => setField('casellario_procedure_estremi', v)}
            />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[#0f1f52]">DSAN Antiriciclaggio</h3>
          <p className="text-xs text-[#64748b]">Tipo documento identità (check una voce)</p>
          <OptionChecks
            name="antiric_documento_tipo"
            value={value.antiric_documento_tipo}
            onChange={(v) => setField('antiric_documento_tipo', v)}
            options={[
              { value: 'carta_identita', label: 'Carta identità' },
              { value: 'patente', label: 'Patente' },
              { value: 'passaporto', label: 'Passaporto' },
              { value: 'altro', label: 'Altro' },
            ]}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <TextInput label="Altro documento (se selezionato)" value={value.antiric_documento_altro} onChange={(v) => setField('antiric_documento_altro', v)} />
            <TextInput label="Numero documento" value={value.antiric_documento_numero} onChange={(v) => setField('antiric_documento_numero', v)} />
            <TextInput label="Data rilascio" value={value.antiric_documento_rilascio_data} onChange={(v) => setField('antiric_documento_rilascio_data', v)} placeholder="gg/mm/aaaa" />
            <TextInput label="Rilasciato da" value={value.antiric_documento_rilasciato_da} onChange={(v) => setField('antiric_documento_rilasciato_da', v)} />
            <TextInput label="Scadenza" value={value.antiric_documento_scadenza} onChange={(v) => setField('antiric_documento_scadenza', v)} placeholder="gg/mm/aaaa" />
          </div>

          <p className="text-xs text-[#64748b]">Criterio titolare effettivo (check una voce)</p>
          <OptionChecks
            name="antiric_criterio"
            value={value.antiric_criterio}
            onChange={(v) => setField('antiric_criterio', v)}
            options={[
              { value: 'assetto', label: 'Criterio dell’assetto proprietario' },
              { value: 'controllo', label: 'Criterio del controllo' },
              { value: 'residuale', label: 'Criterio residuale' },
            ]}
          />

          <p className="text-xs text-[#64748b]">Opzione titolare effettivo (check una voce)</p>
          <OptionChecks
            name="antiric_opzione"
            value={value.antiric_opzione}
            onChange={(v) => setField('antiric_opzione', v)}
            options={[
              { value: '1', label: 'Opzione 1: solo il/la sottoscritto/a' },
              { value: '2', label: 'Opzione 2: sottoscritto/a + altri (assetto proprietario)' },
              { value: '3', label: 'Opzione 3: persone fisiche (criterio controllo)' },
              { value: '4', label: 'Opzione 4: criterio residuale' },
            ]}
          />
          <TextInput
            label="Motivazione criterio residuale (se opzione 4)"
            value={value.antiric_motivazione_residuale}
            onChange={(v) => setField('antiric_motivazione_residuale', v)}
          />
          <TextInput
            label="Note altri titolari effettivi (se presenti)"
            value={value.titolari_effettivi_note}
            onChange={(v) => setField('titolari_effettivi_note', v)}
          />
        </section>
      </div>
    </div>
  );
}
