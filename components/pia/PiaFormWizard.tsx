'use client';

import { useState, useCallback } from 'react';

type PiaFormWizardProps = {
  bandoTitle: string;
  onComplete: (data: Record<string, unknown>) => void;
};

function ChoiceButtons({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="pia-fw-choice">
      {options.map(opt => (
        <button
          key={opt.value}
          className={`pia-fw-choice-btn ${value === opt.value ? 'selected' : ''}`}
          onClick={() => onChange(opt.value)}
          type="button"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const PAGES = [
  {
    icon: '\u{1F4DC}',
    title: 'Casellario e precedenti',
    desc: 'Dichiarazioni obbligatorie ai fini della domanda',
  },
  {
    icon: '\u{1F3ED}',
    title: 'Requisiti iniziativa',
    desc: 'Verifica dei requisiti dell\'attività economica',
  },
  {
    icon: '\u{1F4B0}',
    title: 'De minimis e requisiti',
    desc: 'Aiuti ricevuti e situazione lavorativa',
  },
  {
    icon: '\u{1F9FE}',
    title: 'Antiriciclaggio',
    desc: 'Titolare effettivo e conflitti di interesse',
  },
];

export function PiaFormWizard({ bandoTitle, onComplete }: PiaFormWizardProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [formData, setFormData] = useState<Record<string, unknown>>({
    // DSAN Casellario
    dsanCondanne: '',
    dsanCondanneDettaglio: '',
    dsanMisurePrevenzione: '',
    dsanMisureDettaglio: '',
    dsanProcedureEsecutive: '',
    dsanProcedureDettaglio: '',

    // Requisiti iniziativa
    reqPienoEsercizio: '',
    reqProcedureInterdittive: '',
    reqProcedureInterdittiveDettaglio: '',
    reqCostituitaMesePrecedente: '',
    reqVariazioniSocietarie: '',
    reqVariazioniDettaglio: '',

    // De minimis
    deMinimisRicevuti: '',
    deMinimisAiuti: [
      { tipologia: '', data: '', importo: '', categoria: 'Conto capitale / fondo perduto' },
    ],

    // Requisiti soggettivi
    reqCondizioneLavorativa: '',
    reqAtecoIdentico: '',

    // Antiriciclaggio
    aeTitolareCoincide: '',
    aeCriterio: '',
    aeDati: [
      {
        cognome: '',
        nome: '',
        dataNascita: '',
        comuneNascita: '',
        provinciaNascita: '',
        cf: '',
        comuneResidenza: '',
        provinciaResidenza: '',
        cap: '',
        via: '',
        civico: '',
        tipoDocumento: '',
        numeroDocumento: '',
      },
    ],
    aeConflittoInteressi: '',
    aeConflittoDettaglio: '',
  });

  const totalPages = 4;

  const updateField = useCallback((key: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  }, []);

  const goNext = useCallback(() => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(s => s + 1);
    } else {
      onComplete(formData);
    }
  }, [currentPage, formData, onComplete]);

  const goBack = useCallback(() => {
    if (currentPage > 0) {
      setCurrentPage(s => s - 1);
    }
  }, [currentPage]);

  const canGoNext = useCallback(
    (page: number): boolean => {
      switch (page) {
        case 0:
          if (!formData.dsanCondanne || !formData.dsanMisurePrevenzione || !formData.dsanProcedureEsecutive) return false;
          if ((formData.dsanCondanne as string) === 'si' && (formData.dsanCondanneDettaglio as string || '').trim().length < 3) return false;
          if ((formData.dsanMisurePrevenzione as string) === 'si' && (formData.dsanMisureDettaglio as string || '').trim().length < 3) return false;
          if ((formData.dsanProcedureEsecutive as string) === 'si' && (formData.dsanProcedureDettaglio as string || '').trim().length < 3) return false;
          return true;
        case 1:
          if (!formData.reqPienoEsercizio || !formData.reqProcedureInterdittive || !formData.reqCostituitaMesePrecedente || !formData.reqVariazioniSocietarie) return false;
          if ((formData.reqProcedureInterdittive as string) === 'si' && (formData.reqProcedureInterdittiveDettaglio as string || '').trim().length < 3) return false;
          if ((formData.reqVariazioniSocietarie as string) === 'si' && (formData.reqVariazioniDettaglio as string || '').trim().length < 3) return false;
          return true;
        case 2:
          if (!formData.deMinimisRicevuti || !formData.reqCondizioneLavorativa || !formData.reqAtecoIdentico) return false;
          return true;
        case 3:
          if (!formData.aeTitolareCoincide || !formData.aeConflittoInteressi) return false;
          if (formData.aeTitolareCoincide as string === 'no') {
            const dati = formData.aeDati as Array<Record<string, string>>;
            const row = dati[0];
            if (!row || !row.cognome || !row.nome || !row.cf) return false;
          }
          if ((formData.aeConflittoInteressi as string) === 'si' && (formData.aeConflittoDettaglio as string || '').trim().length < 3) return false;
          return true;
        default:
          return true;
      }
    },
    [formData],
  );

  const meta = PAGES[currentPage];

  return (
    <div className="pia-fw">
      {/* Progress indicator */}
      <div className="pia-fw-progress">
        <span className="pia-fw-step-label">Pagina {currentPage + 1} di {totalPages}</span>
        <div className="pia-fw-dots">
          {Array.from({ length: totalPages }).map((_, i) => (
            <div
              key={i}
              className={`pia-fw-dot ${i === currentPage ? 'active' : i < currentPage ? 'done' : ''}`}
            />
          ))}
        </div>
      </div>

      <div className="pia-fw-page" key={currentPage}>
        <div className="pia-fw-header">
          <div className="pia-fw-icon">{meta.icon}</div>
          <div>
            <h2 className="pia-fw-title">{meta.title}</h2>
            <p className="pia-fw-desc">{meta.desc}</p>
          </div>
        </div>

        <div className="pia-fw-body">
          {/* ========== Pagina 1: DSAN Casellario ========== */}
          {currentPage === 0 && (
            <>
              <div className="pia-fw-section">
                <div className="pia-fw-section-title">
                  Condanne penali <span className="pia-fw-why-label">dichiarazione obbligatoria</span>
                </div>
                <ChoiceButtons
                  options={[
                    { label: 'No', value: 'no' },
                    { label: 'Sì', value: 'si' },
                  ]}
                  value={formData.dsanCondanne as string}
                  onChange={v => {
                    updateField('dsanCondanne', v);
                    if (v === 'no') updateField('dsanCondanneDettaglio', '');
                  }}
                />
                {(formData.dsanCondanne as string) === 'si' && (
                  <div className="pia-fw-field" style={{ marginTop: 10 }}>
                    <textarea
                      placeholder="Indica gli estremi del provvedimento..."
                      style={{ minHeight: 56 }}
                      value={formData.dsanCondanneDettaglio as string}
                      onChange={e => updateField('dsanCondanneDettaglio', e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="pia-fw-section">
                <div className="pia-fw-section-title">
                  Misure di prevenzione <span className="pia-fw-why-label">dichiarazione obbligatoria</span>
                </div>
                <ChoiceButtons
                  options={[
                    { label: 'No', value: 'no' },
                    { label: 'Sì', value: 'si' },
                  ]}
                  value={formData.dsanMisurePrevenzione as string}
                  onChange={v => {
                    updateField('dsanMisurePrevenzione', v);
                    if (v === 'no') updateField('dsanMisureDettaglio', '');
                  }}
                />
                {(formData.dsanMisurePrevenzione as string) === 'si' && (
                  <div className="pia-fw-field" style={{ marginTop: 10 }}>
                    <textarea
                      placeholder="Indica gli estremi del provvedimento..."
                      style={{ minHeight: 56 }}
                      value={formData.dsanMisureDettaglio as string}
                      onChange={e => updateField('dsanMisureDettaglio', e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="pia-fw-section">
                <div className="pia-fw-section-title">
                  Procedure esecutive / concorsuali <span className="pia-fw-why-label">dichiarazione obbligatoria</span>
                </div>
                <ChoiceButtons
                  options={[
                    { label: 'No', value: 'no' },
                    { label: 'Sì', value: 'si' },
                  ]}
                  value={formData.dsanProcedureEsecutive as string}
                  onChange={v => {
                    updateField('dsanProcedureEsecutive', v);
                    if (v === 'no') updateField('dsanProcedureDettaglio', '');
                  }}
                />
                {(formData.dsanProcedureEsecutive as string) === 'si' && (
                  <div className="pia-fw-field" style={{ marginTop: 10 }}>
                    <textarea
                      placeholder="Indica gli estremi della procedura..."
                      style={{ minHeight: 56 }}
                      value={formData.dsanProcedureDettaglio as string}
                      onChange={e => updateField('dsanProcedureDettaglio', e.target.value)}
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {/* ========== Pagina 2: Requisiti iniziativa economica ========== */}
          {currentPage === 1 && (
            <>
              <div className="pia-fw-section">
                <div className="pia-fw-section-title">
                  L&rsquo;iniziativa gode del pieno e libero esercizio dei diritti?
                </div>
                <ChoiceButtons
                  options={[
                    { label: 'Sì', value: 'si' },
                    { label: 'No', value: 'no' },
                  ]}
                  value={formData.reqPienoEsercizio as string}
                  onChange={v => updateField('reqPienoEsercizio', v)}
                />
              </div>

              <div className="pia-fw-section">
                <div className="pia-fw-section-title">
                  Esistono procedure giudiziarie interdittive/esecutive/cautelari verso l&rsquo;iniziativa?
                </div>
                <ChoiceButtons
                  options={[
                    { label: 'No', value: 'no' },
                    { label: 'Sì', value: 'si' },
                  ]}
                  value={formData.reqProcedureInterdittive as string}
                  onChange={v => {
                    updateField('reqProcedureInterdittive', v);
                    if (v === 'no') updateField('reqProcedureInterdittiveDettaglio', '');
                  }}
                />
                {(formData.reqProcedureInterdittive as string) === 'si' && (
                  <div className="pia-fw-field" style={{ marginTop: 10 }}>
                    <textarea
                      placeholder="Descrivi le procedure..."
                      style={{ minHeight: 56 }}
                      value={formData.reqProcedureInterdittiveDettaglio as string}
                      onChange={e => updateField('reqProcedureInterdittiveDettaglio', e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="pia-fw-section">
                <div className="pia-fw-section-title">
                  L&rsquo;iniziativa &egrave; costituita nel mese precedente la domanda e inattiva alla presentazione?
                </div>
                <ChoiceButtons
                  options={[
                    { label: 'Sì', value: 'si' },
                    { label: 'No', value: 'no' },
                  ]}
                  value={formData.reqCostituitaMesePrecedente as string}
                  onChange={v => updateField('reqCostituitaMesePrecedente', v)}
                />
              </div>

              <div className="pia-fw-section">
                <div className="pia-fw-section-title">
                  L&rsquo;assetto societario/organo amministrativo ha subito variazioni?
                </div>
                <ChoiceButtons
                  options={[
                    { label: 'No', value: 'no' },
                    { label: 'Sì', value: 'si' },
                  ]}
                  value={formData.reqVariazioniSocietarie as string}
                  onChange={v => {
                    updateField('reqVariazioniSocietarie', v);
                    if (v === 'no') updateField('reqVariazioniDettaglio', '');
                  }}
                />
                {(formData.reqVariazioniSocietarie as string) === 'si' && (
                  <div className="pia-fw-field" style={{ marginTop: 10 }}>
                    <textarea
                      placeholder="Descrivi le variazioni..."
                      style={{ minHeight: 56 }}
                      value={formData.reqVariazioniDettaglio as string}
                      onChange={e => updateField('reqVariazioniDettaglio', e.target.value)}
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {/* ========== Pagina 3: De minimis + Requisiti soggettivi ========== */}
          {currentPage === 2 && (
            <>
              <div className="pia-fw-section">
                <div className="pia-fw-section-title">
                  Aiuti in regime de minimis <span className="pia-fw-why-label">negli ultimi 3 anni</span>
                </div>
                <ChoiceButtons
                  options={[
                    { label: 'No, nessun aiuto', value: 'no' },
                    { label: 'Sì, ho ricevuto', value: 'si' },
                  ]}
                  value={formData.deMinimisRicevuti as string}
                  onChange={v => {
                    updateField('deMinimisRicevuti', v);
                    if (v === 'no')
                      updateField('deMinimisAiuti', [
                        { tipologia: '', data: '', importo: '', categoria: 'Conto capitale / fondo perduto' },
                      ]);
                  }}
                />
                {(formData.deMinimisRicevuti as string) === 'si' &&
                  (() => {
                    const aiuti = formData.deMinimisAiuti as Array<{
                      tipologia: string;
                      data: string;
                      importo: string;
                      categoria: string;
                    }>;
                    return (
                      <div style={{ marginTop: 10 }}>
                        {aiuti.map((item, i) => (
                          <div key={i} className="pia-fw-repeat-group">
                            <div className="pia-fw-repeat-header">
                              <span>Aiuto #{i + 1}</span>
                              {aiuti.length > 1 && (
                                <button
                                  type="button"
                                  className="pia-fw-remove-btn"
                                  onClick={() => {
                                    const next = aiuti.filter((_, idx) => idx !== i);
                                    updateField('deMinimisAiuti', next);
                                  }}
                                >
                                  Rimuovi
                                </button>
                              )}
                            </div>
                            <div className="pia-fw-field">
                              <label>Tipologia contributo / agevolazione</label>
                              <input
                                type="text"
                                placeholder="Es. Contributo a fondo perduto"
                                value={item.tipologia}
                                onChange={e => {
                                  const next = [...aiuti];
                                  next[i] = { ...next[i], tipologia: e.target.value };
                                  updateField('deMinimisAiuti', next);
                                }}
                              />
                            </div>
                            <div className="pia-fw-field-row">
                              <div className="pia-fw-field">
                                <label>Data ottenimento</label>
                                <input
                                  type="date"
                                  value={item.data}
                                  onChange={e => {
                                    const next = [...aiuti];
                                    next[i] = { ...next[i], data: e.target.value };
                                    updateField('deMinimisAiuti', next);
                                  }}
                                />
                              </div>
                              <div className="pia-fw-field">
                                <label>Importo (&euro;)</label>
                                <input
                                  type="text"
                                  placeholder="0,00"
                                  value={item.importo}
                                  onChange={e => {
                                    const next = [...aiuti];
                                    next[i] = { ...next[i], importo: e.target.value };
                                    updateField('deMinimisAiuti', next);
                                  }}
                                />
                              </div>
                            </div>
                            <div className="pia-fw-field">
                              <label>Categoria</label>
                              <select
                                value={item.categoria}
                                onChange={e => {
                                  const next = [...aiuti];
                                  next[i] = { ...next[i], categoria: e.target.value };
                                  updateField('deMinimisAiuti', next);
                                }}
                              >
                                <option>Conto capitale / fondo perduto</option>
                                <option>Conto interessi / mutuo / leasing</option>
                                <option>Sgravi fiscali</option>
                                <option>Garanzie sui prestiti</option>
                                <option>Altro</option>
                              </select>
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="pia-fw-add-btn"
                          onClick={() => {
                            updateField('deMinimisAiuti', [
                              ...aiuti,
                              { tipologia: '', data: '', importo: '', categoria: 'Conto capitale / fondo perduto' },
                            ]);
                          }}
                        >
                          + Aggiungi altro aiuto
                        </button>
                      </div>
                    );
                  })()}
              </div>

              <hr className="pia-fw-divider" />

              <div className="pia-fw-section">
                <div className="pia-fw-section-title">Condizione lavorativa</div>
                <ChoiceButtons
                  options={[
                    { label: 'Inoccupato / Disoccupato', value: 'inoccupato' },
                    { label: 'Disoccupato GOL', value: 'gol' },
                    { label: 'Working poor', value: 'working-poor' },
                  ]}
                  value={formData.reqCondizioneLavorativa as string}
                  onChange={v => updateField('reqCondizioneLavorativa', v)}
                />
              </div>

              <div className="pia-fw-section">
                <div className="pia-fw-section-title">
                  Negli ultimi 6 mesi sei stato socio/titolare di attivit&agrave; con ATECO identico fino alla terza cifra?
                </div>
                <ChoiceButtons
                  options={[
                    { label: 'No', value: 'no' },
                    { label: 'Sì', value: 'si' },
                  ]}
                  value={formData.reqAtecoIdentico as string}
                  onChange={v => updateField('reqAtecoIdentico', v)}
                />
              </div>
            </>
          )}

          {/* ========== Pagina 4: Antiriciclaggio / Titolare effettivo ========== */}
          {currentPage === 3 && (
            <>
              <div className="pia-fw-section">
                <div className="pia-fw-section-title">Il titolare effettivo coincide con il dichiarante?</div>
                <ChoiceButtons
                  options={[
                    { label: 'Sì', value: 'si' },
                    { label: 'No', value: 'no' },
                  ]}
                  value={formData.aeTitolareCoincide as string}
                  onChange={v => {
                    updateField('aeTitolareCoincide', v);
                    if (v === 'no') updateField('aeCriterio', '');
                  }}
                />

                {(formData.aeTitolareCoincide as string) === 'si' && (
                  <div className="pia-fw-field" style={{ marginTop: 10 }}>
                    <label>Criterio titolare effettivo</label>
                    <select
                      value={formData.aeCriterio as string}
                      onChange={e => updateField('aeCriterio', e.target.value)}
                    >
                      <option value="">Seleziona...</option>
                      <option value="assetto-proprietario">Assetto proprietario</option>
                      <option value="controllo">Controllo</option>
                      <option value="altro">Altro</option>
                    </select>
                  </div>
                )}

                {(formData.aeTitolareCoincide as string) === 'no' &&
                  (() => {
                    const dati = formData.aeDati as Array<Record<string, string>>;
                    return (
                      <div style={{ marginTop: 10 }}>
                        {dati.map((row, i) => (
                          <div key={i} className="pia-fw-repeat-group">
                            <div className="pia-fw-repeat-header">
                              <span>Dati titolare effettivo</span>
                            </div>
                            <div className="pia-fw-field-row">
                              <div className="pia-fw-field">
                                <label>Cognome</label>
                                <input
                                  type="text"
                                  value={row.cognome}
                                  onChange={e => {
                                    const next = [...dati];
                                    next[i] = { ...next[i], cognome: e.target.value };
                                    updateField('aeDati', next);
                                  }}
                                />
                              </div>
                              <div className="pia-fw-field">
                                <label>Nome</label>
                                <input
                                  type="text"
                                  value={row.nome}
                                  onChange={e => {
                                    const next = [...dati];
                                    next[i] = { ...next[i], nome: e.target.value };
                                    updateField('aeDati', next);
                                  }}
                                />
                              </div>
                            </div>
                            <div className="pia-fw-field-row">
                              <div className="pia-fw-field">
                                <label>Data nascita</label>
                                <input
                                  type="date"
                                  value={row.dataNascita}
                                  onChange={e => {
                                    const next = [...dati];
                                    next[i] = { ...next[i], dataNascita: e.target.value };
                                    updateField('aeDati', next);
                                  }}
                                />
                              </div>
                              <div className="pia-fw-field">
                                <label>C.F.</label>
                                <input
                                  type="text"
                                  placeholder="RSSMRA85..."
                                  value={row.cf}
                                  onChange={e => {
                                    const next = [...dati];
                                    next[i] = { ...next[i], cf: e.target.value.toUpperCase() };
                                    updateField('aeDati', next);
                                  }}
                                />
                              </div>
                            </div>
                            <div className="pia-fw-field-row">
                              <div className="pia-fw-field">
                                <label>Comune nascita</label>
                                <input
                                  type="text"
                                  value={row.comuneNascita}
                                  onChange={e => {
                                    const next = [...dati];
                                    next[i] = { ...next[i], comuneNascita: e.target.value };
                                    updateField('aeDati', next);
                                  }}
                                />
                              </div>
                              <div className="pia-fw-field">
                                <label>Provincia nascita</label>
                                <input
                                  type="text"
                                  placeholder="MI"
                                  maxLength={2}
                                  value={row.provinciaNascita}
                                  onChange={e => {
                                    const next = [...dati];
                                    next[i] = { ...next[i], provinciaNascita: e.target.value.toUpperCase() };
                                    updateField('aeDati', next);
                                  }}
                                />
                              </div>
                            </div>

                            <div className="pia-fw-field">
                              <label>Residenza</label>
                            </div>
                            <div className="pia-fw-field-row">
                              <div className="pia-fw-field">
                                <label>Comune</label>
                                <input
                                  type="text"
                                  value={row.comuneResidenza}
                                  onChange={e => {
                                    const next = [...dati];
                                    next[i] = { ...next[i], comuneResidenza: e.target.value };
                                    updateField('aeDati', next);
                                  }}
                                />
                              </div>
                              <div className="pia-fw-field">
                                <label>Provincia</label>
                                <input
                                  type="text"
                                  placeholder="MI"
                                  maxLength={2}
                                  value={row.provinciaResidenza}
                                  onChange={e => {
                                    const next = [...dati];
                                    next[i] = { ...next[i], provinciaResidenza: e.target.value.toUpperCase() };
                                    updateField('aeDati', next);
                                  }}
                                />
                              </div>
                            </div>
                            <div className="pia-fw-field-row">
                              <div className="pia-fw-field">
                                <label>CAP</label>
                                <input
                                  type="text"
                                  placeholder="20100"
                                  maxLength={5}
                                  value={row.cap}
                                  onChange={e => {
                                    const next = [...dati];
                                    next[i] = { ...next[i], cap: e.target.value };
                                    updateField('aeDati', next);
                                  }}
                                />
                              </div>
                              <div className="pia-fw-field" style={{ flex: 2 }}>
                                <label>Via / Piazza</label>
                                <input
                                  type="text"
                                  value={row.via}
                                  onChange={e => {
                                    const next = [...dati];
                                    next[i] = { ...next[i], via: e.target.value };
                                    updateField('aeDati', next);
                                  }}
                                />
                              </div>
                              <div className="pia-fw-field">
                                <label>N.</label>
                                <input
                                  type="text"
                                  placeholder="12"
                                  value={row.civico}
                                  onChange={e => {
                                    const next = [...dati];
                                    next[i] = { ...next[i], civico: e.target.value };
                                    updateField('aeDati', next);
                                  }}
                                />
                              </div>
                            </div>
                            <div className="pia-fw-field-row">
                              <div className="pia-fw-field">
                                <label>Tipo documento</label>
                                <select
                                  value={row.tipoDocumento}
                                  onChange={e => {
                                    const next = [...dati];
                                    next[i] = { ...next[i], tipoDocumento: e.target.value };
                                    updateField('aeDati', next);
                                  }}
                                >
                                  <option value="">Seleziona...</option>
                                  <option value="carta-identita">Carta d&rsquo;identit&agrave;</option>
                                  <option value="passaporto">Passaporto</option>
                                  <option value="patente">Patente di guida</option>
                                  <option value="altro">Altro</option>
                                </select>
                              </div>
                              <div className="pia-fw-field">
                                <label>Numero documento</label>
                                <input
                                  type="text"
                                  value={row.numeroDocumento}
                                  onChange={e => {
                                    const next = [...dati];
                                    next[i] = { ...next[i], numeroDocumento: e.target.value };
                                    updateField('aeDati', next);
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
              </div>

              <div className="pia-fw-section">
                <div className="pia-fw-section-title">
                  Esistono situazioni di conflitto di interessi, anche potenziali?
                </div>
                <ChoiceButtons
                  options={[
                    { label: 'No', value: 'no' },
                    { label: 'Sì', value: 'si' },
                  ]}
                  value={formData.aeConflittoInteressi as string}
                  onChange={v => {
                    updateField('aeConflittoInteressi', v);
                    if (v === 'no') updateField('aeConflittoDettaglio', '');
                  }}
                />
                {(formData.aeConflittoInteressi as string) === 'si' && (
                  <div className="pia-fw-field" style={{ marginTop: 10 }}>
                    <textarea
                      placeholder="Descrivi i dettagli..."
                      style={{ minHeight: 56 }}
                      value={formData.aeConflittoDettaglio as string}
                      onChange={e => updateField('aeConflittoDettaglio', e.target.value)}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="pia-fw-nav">
          <div className="pia-fw-nav-left">
            {currentPage > 0 && (
              <button type="button" className="pia-fw-btn-back" onClick={goBack}>
                &larr; Indietro
              </button>
            )}
          </div>
          <div className="pia-fw-nav-right">
            <button
              type="button"
              className="pia-fw-btn-next"
              onClick={goNext}
              disabled={!canGoNext(currentPage)}
            >
              {currentPage === totalPages - 1 ? 'Invia domanda' : 'Avanti →'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .pia-fw {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          width: 100%;
          max-width: 640px;
          margin: 0 auto;
        }

        /* Progress */
        .pia-fw-progress {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 28px;
        }
        .pia-fw-step-label {
          font-size: 12px;
          font-weight: 500;
          color: rgba(11,17,54,0.5);
          letter-spacing: -0.01em;
        }
        .pia-fw-dots { display: flex; gap: 6px; }
        .pia-fw-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: rgba(11,17,54,0.1);
          transition: all .3s;
        }
        .pia-fw-dot.active {
          background: var(--navy, #0B1136);
          transform: scale(1.3);
        }
        .pia-fw-dot.done { background: var(--green, #0acf83); }

        /* Page */
        .pia-fw-page {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 20px;
          animation: piaFwFadeIn .35s ease both;
        }
        @keyframes piaFwFadeIn {
          0%   { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        /* Header */
        .pia-fw-header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .pia-fw-icon { font-size: 26px; flex-shrink: 0; margin-top: 2px; }
        .pia-fw-title {
          font-size: 20px;
          font-weight: 600;
          letter-spacing: -0.03em;
          color: var(--navy, #0B1136);
          margin: 0 0 2px;
        }
        .pia-fw-desc {
          font-size: 12px;
          color: rgba(11,17,54,0.6);
          margin: 0;
          line-height: 1.5;
          letter-spacing: -0.01em;
        }

        /* Body scrollable */
        .pia-fw-body {
          background: #F1F2F4;
          border-radius: 16px;
          padding: 24px;
          max-height: 540px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        /* Section */
        .pia-fw-section-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--navy, #0B1136);
          margin-bottom: 8px;
          letter-spacing: -0.02em;
          line-height: 1.4;
        }
        .pia-fw-why-label {
          font-weight: 400;
          font-size: 10px;
          color: rgba(11,17,54,0.45);
          margin-left: 6px;
        }

        /* Fields */
        .pia-fw-field { margin-bottom: 10px; }
        .pia-fw-field:last-child { margin-bottom: 0; }
        .pia-fw-field label {
          display: block;
          font-size: 11px;
          font-weight: 600;
          margin-bottom: 4px;
          letter-spacing: -0.01em;
          color: var(--navy, #0B1136);
        }
        .pia-fw-field input[type="text"],
        .pia-fw-field input[type="tel"],
        .pia-fw-field input[type="date"],
        .pia-fw-field textarea,
        .pia-fw-field select {
          width: 100%;
          padding: 10px 12px;
          border: 0.5px solid rgba(11,17,54,0.1);
          border-radius: 10px;
          font-size: 12px;
          font-family: inherit;
          background: #fff;
          color: var(--navy, #0B1136);
          transition: border-color .15s;
          box-sizing: border-box;
        }
        .pia-fw-field input:focus,
        .pia-fw-field textarea:focus,
        .pia-fw-field select:focus {
          outline: none;
          border-color: var(--navy, #0B1136);
        }
        .pia-fw-field textarea { resize: vertical; min-height: 72px; }
        .pia-fw-field select {
          background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2364748B' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 10px center;
          padding-right: 28px;
          appearance: none;
        }
        .pia-fw-field-row {
          display: flex;
          gap: 10px;
        }
        .pia-fw-field-row .pia-fw-field {
          flex: 1;
        }

        /* Choice */
        .pia-fw-choice { display: flex; gap: 8px; margin-top: 4px; }
        .pia-fw-choice-btn {
          flex: 1;
          padding: 12px 10px;
          border: 0.5px solid rgba(11,17,54,0.1);
          border-radius: 10px;
          background: #fff;
          font-size: 11.1px;
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
          transition: all .15s;
          color: var(--navy, #0B1136);
          letter-spacing: -0.01em;
        }
        .pia-fw-choice-btn:hover {
          border-color: var(--navy, #0B1136);
          background: rgba(11,17,54,0.04);
        }
        .pia-fw-choice-btn.selected {
          border-color: var(--navy, #0B1136);
          background: var(--navy, #0B1136);
          color: #fff;
        }

        /* Repeatable groups */
        .pia-fw-repeat-group {
          padding: 12px;
          background: #fff;
          border-radius: 10px;
          margin-bottom: 8px;
        }
        .pia-fw-repeat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 10px;
          font-weight: 600;
          color: rgba(11,17,54,0.5);
          margin-bottom: 8px;
        }
        .pia-fw-remove-btn {
          background: none;
          border: none;
          color: #ef4444;
          font-size: 10px;
          cursor: pointer;
          font-family: inherit;
          font-weight: 500;
        }
        .pia-fw-add-btn {
          width: 100%;
          text-align: center;
          font-size: 10px;
          font-weight: 600;
          color: var(--navy, #0B1136);
          opacity: 0.5;
          cursor: pointer;
          padding: 8px;
          border-radius: 10px;
          background: rgba(11,17,54,0.04);
          border: none;
          font-family: inherit;
          letter-spacing: -0.01em;
          transition: opacity .2s;
        }
        .pia-fw-add-btn:hover { opacity: 1; }

        /* Divider */
        .pia-fw-divider {
          border: none;
          border-top: 0.5px solid rgba(11,17,54,0.08);
          margin: 0;
        }

        /* Nav */
        .pia-fw-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 4px;
        }
        .pia-fw-nav-left { flex: 1; display: flex; justify-content: flex-start; }
        .pia-fw-nav-right { flex: 1; display: flex; justify-content: flex-end; }
        .pia-fw-btn-back {
          padding: 10px 20px;
          border: 0.5px solid rgba(11,17,54,0.1);
          border-radius: 10px;
          background: #fff;
          color: var(--navy, #0B1136);
          font-size: 11.1px;
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
          transition: all .2s;
          letter-spacing: -0.01em;
          white-space: nowrap;
        }
        .pia-fw-btn-back:hover { border-color: var(--navy, #0B1136); }
        .pia-fw-btn-next {
          padding: 12px 28px;
          border: none;
          border-radius: 10px;
          background: var(--navy, #0B1136);
          color: #fff;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: all .2s;
          letter-spacing: -0.01em;
          white-space: nowrap;
          min-width: 120px;
        }
        .pia-fw-btn-next:hover {
          background: linear-gradient(135deg, var(--green, #0acf83), var(--green-dark, #16a34a));
        }
        .pia-fw-btn-next:disabled {
          opacity: 0.25;
          cursor: default;
          pointer-events: none;
        }

        @media (max-width: 480px) {
          .pia-fw { padding: 24px 16px; }
          .pia-fw-title { font-size: 18px; }
          .pia-fw-body { padding: 16px; max-height: none; }
          .pia-fw-choice { flex-direction: column; }
          .pia-fw-field-row { flex-direction: column; gap: 0; }
        }
      `}</style>
    </div>
  );
}
