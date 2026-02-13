'use client';

import { useId, useState } from 'react';
import { RequestDocumentsForm } from '@/components/admin/RequestDocumentsForm';

export function RequestDocumentsModal({
  threadId,
  context,
  buttonLabel = 'Nuova richiesta'
}: {
  threadId: string | null;
  context: string;
  buttonLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  if (!threadId) {
    return (
      <button type="button" className="btn-action" disabled style={{ opacity: 0.6, cursor: 'not-allowed' }}>
        {buttonLabel}
      </button>
    );
  }

  return (
    <>
      <button type="button" className="btn-action primary" onClick={() => setOpen(true)}>
        <span>✉️</span>
        <span>{buttonLabel}</span>
      </button>

      <div className={`admin-modal-overlay ${open ? 'active' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="admin-modal-content">
          <div className="admin-modal-header">
            <div id={titleId} className="admin-modal-title">
              Richiedi documenti
            </div>
            <button type="button" className="admin-modal-close" onClick={() => setOpen(false)} aria-label="Chiudi">
              ✕
            </button>
          </div>

          <div className="admin-modal-subtitle">{context}</div>

          <div className="admin-modal-body">
            <RequestDocumentsForm threadId={threadId} context={context} />
          </div>
        </div>
      </div>
    </>
  );
}

