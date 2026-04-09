'use client';

import { useState } from 'react';

type GrantDetailSectionBlockKind = 'official_facts' | 'bndo_explanation' | 'examples' | 'warnings';

type GrantDetailSectionBlock = {
  kind: GrantDetailSectionBlockKind;
  title: string;
  items: string[];
};

type GrantDetailSource = {
  label: string;
  location: string;
  excerpt?: string;
  url?: string;
};

type GrantDetailSectionPayload = {
  id: string;
  title: string;
  summary: string;
  status: 'grounded' | 'partial';
  blocks: GrantDetailSectionBlock[];
  sources: GrantDetailSource[];
};

type GrantDetailContentPayload = {
  generatedAt: string;
  completenessScore: number;
  warnings: string[];
  sections: GrantDetailSectionPayload[];
};

const BLOCK_LABELS: Record<GrantDetailSectionBlockKind, string> = {
  official_facts: 'Dati ufficiali',
  bndo_explanation: 'Lettura pratica BNDO',
  examples: 'Esempio pratico',
  warnings: 'Attenzione',
};

const pairSections = (sections: GrantDetailSectionPayload[]): GrantDetailSectionPayload[][] => {
  const pairs: GrantDetailSectionPayload[][] = [];
  for (let index = 0; index < sections.length; index += 2) {
    pairs.push(sections.slice(index, index + 2));
  }
  return pairs;
};

export function GrantDetailExpandableSections({
  content,
  officialUrl,
}: {
  content: GrantDetailContentPayload | null;
  officialUrl: string;
}) {
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);

  const sections = content?.sections ?? [];
  const groupedSections = pairSections(sections);

  if (!content || !sections.length) {
    return (
      <section className="premium-card fade-up p-6 grant-detail-section grant-detail-explainer">
        <h2 className="grant-section-title">Guida pratica al bando</h2>
        <p className="grant-empty-note">
          Alcuni dettagli operativi non sono ancora completi. Apri la fonte ufficiale e usa “Verifica requisiti” per
          una pre-analisi guidata sul tuo caso.
        </p>
        <a href={officialUrl} target="_blank" rel="noreferrer" className="grant-inline-link">
          Apri la fonte ufficiale
        </a>
      </section>
    );
  }

  return (
    <section className="premium-card fade-up p-6 grant-detail-section grant-detail-explainer">
      <div className="grant-detail-explainer-head">
        <h2 className="grant-section-title">Guida pratica al bando</h2>
      </div>

      {content.warnings.length > 0 ? (
        <div className="grant-detail-alert-note">
          <p>Non è specificato nella fonte ufficiale per alcune sezioni: apri i dettagli per vedere cosa manca.</p>
        </div>
      ) : null}

      <div className="grant-detail-pair-groups">
        {groupedSections.map((pair, pairIndex) => (
          <article key={`pair-${pairIndex}`} className="grant-detail-pair-shell">
            <div className="grant-detail-pair-grid">
              {pair.map((section) => {
                const isOpen = section.id === openSectionId;
                return (
                  <div key={section.id} className={`grant-detail-section-item${isOpen ? ' is-open' : ''}`}>
                    <button
                      type="button"
                      className="grant-detail-section-trigger"
                      onClick={() => setOpenSectionId(isOpen ? null : section.id)}
                      aria-expanded={isOpen}
                      aria-controls={`grant-detail-panel-${section.id}`}
                    >
                      <span className="grant-detail-section-copy">
                        <span className="grant-detail-section-title">{section.title}</span>
                        <span className="grant-detail-section-summary">{section.summary}</span>
                      </span>
                      <span className="grant-detail-section-open-label">{isOpen ? 'Chiudi dettagli' : 'Apri dettagli'}</span>
                    </button>

                    {isOpen ? (
                      <div id={`grant-detail-panel-${section.id}`} className="grant-detail-section-panel">
                        {section.status === 'partial' ? (
                          <p className="grant-detail-missing-note">Non è specificato nella fonte ufficiale in modo completo.</p>
                        ) : null}

                        {section.blocks.map((block) => (
                          <div
                            key={`${section.id}-${block.kind}-${block.title}`}
                            className={`grant-detail-block grant-detail-block--${block.kind}`}
                          >
                            <h3>{block.title || BLOCK_LABELS[block.kind]}</h3>
                            <ul>
                              {block.items.map((item) => (
                                <li key={`${section.id}-${block.kind}-${item}`}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
