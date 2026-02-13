'use client';

import { useEffect, useMemo, useState } from 'react';

type CrmPayload = {
  priority: 'bassa' | 'media' | 'alta' | null;
  tags: string[];
  admin_notes: string;
  admin_fields: Record<string, string>;
  next_action_at: string | null; // YYYY-MM-DD
};

function normalizeTags(raw: string) {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30);
}

export function AdminClientCrmForm({
  companyId,
  isMock
}: {
  companyId: string;
  isMock: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [priority, setPriority] = useState<CrmPayload['priority']>('media');
  const [tagsRaw, setTagsRaw] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [nextActionAt, setNextActionAt] = useState<string>('');

  const [referente, setReferente] = useState<string>('');
  const [canale, setCanale] = useState<string>('');
  const [telefonoAlt, setTelefonoAlt] = useState<string>('');
  const [noteChiamata, setNoteChiamata] = useState<string>('');

  const payload: CrmPayload = useMemo(
    () => ({
      priority,
      tags: normalizeTags(tagsRaw),
      admin_notes: notes,
      next_action_at: nextActionAt.trim() ? nextActionAt.trim() : null,
      admin_fields: {
        referente: referente.trim(),
        canale: canale.trim(),
        telefono_alt: telefonoAlt.trim(),
        note_chiamata: noteChiamata.trim()
      }
    }),
    [priority, tagsRaw, notes, nextActionAt, referente, canale, telefonoAlt, noteChiamata]
  );

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      setOk(null);
      try {
        if (isMock) {
          const raw = localStorage.getItem(`bndo:crm:${companyId}`);
          if (raw) {
            const parsed = JSON.parse(raw) as Partial<CrmPayload>;
            if (!cancelled) {
              setPriority((parsed.priority as CrmPayload['priority']) ?? 'media');
              setTagsRaw((parsed.tags ?? []).join(', '));
              setNotes(parsed.admin_notes ?? '');
              setNextActionAt(parsed.next_action_at ?? '');
              setReferente(parsed.admin_fields?.referente ?? '');
              setCanale(parsed.admin_fields?.canale ?? '');
              setTelefonoAlt(parsed.admin_fields?.telefono_alt ?? '');
              setNoteChiamata(parsed.admin_fields?.note_chiamata ?? '');
            }
          }
          return;
        }

        const res = await fetch(`/api/admin/company-crm?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' });
        const json = (await res.json()) as { error?: string; data?: Partial<CrmPayload> };
        if (!res.ok) throw new Error(json?.error ?? 'Errore caricamento CRM.');

        const data = json.data ?? {};
        if (!cancelled) {
          setPriority((data.priority as CrmPayload['priority']) ?? 'media');
          setTagsRaw(((data.tags ?? []) as string[]).join(', '));
          setNotes((data.admin_notes ?? '') as string);
          setNextActionAt((data.next_action_at ?? '') as string);
          setReferente((data.admin_fields?.referente ?? '') as string);
          setCanale((data.admin_fields?.canale ?? '') as string);
          setTelefonoAlt((data.admin_fields?.telefono_alt ?? '') as string);
          setNoteChiamata((data.admin_fields?.note_chiamata ?? '') as string);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Errore caricamento.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [companyId, isMock]);

  async function save() {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      if (isMock) {
        localStorage.setItem(`bndo:crm:${companyId}`, JSON.stringify(payload));
        setOk('Salvato (mock).');
        return;
      }

      const res = await fetch('/api/admin/company-crm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyId, ...payload })
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json?.error ?? 'Salvataggio non riuscito.');
      setOk('Salvato.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore salvataggio.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="section-card">
      <div className="section-title">
        <span>Informazioni aggiuntive</span>
      </div>

      {loading ? <div className="admin-item-sub">Caricamento…</div> : null}
      {error ? (
        <div className="admin-item-sub" style={{ color: '#B91C1C', fontWeight: 500 }}>
          {error}
        </div>
      ) : null}
      {ok ? (
        <div className="admin-item-sub" style={{ color: '#065F46', fontWeight: 500 }}>
          {ok}
        </div>
      ) : null}

      <div className="admin-crm-grid" aria-busy={saving ? 'true' : 'false'}>
        <div className="modal-field">
          <label className="modal-label">Priorita</label>
          <select className="modal-select" value={priority ?? ''} onChange={(e) => setPriority((e.target.value as CrmPayload['priority']) || null)}>
            <option value="bassa">Bassa</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
          </select>
        </div>

        <div className="modal-field admin-crm-span2">
          <label className="modal-label">Tag (separati da virgola)</label>
          <input className="modal-input" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} placeholder="Es: priorita, richiamare, documenti" />
        </div>

        <div className="modal-field">
          <label className="modal-label">Prossima azione (data)</label>
          <input className="modal-input" type="date" value={nextActionAt} onChange={(e) => setNextActionAt(e.target.value)} />
        </div>

        <div className="modal-field">
          <label className="modal-label">Referente</label>
          <input className="modal-input" value={referente} onChange={(e) => setReferente(e.target.value)} placeholder="Nome referente" />
        </div>

        <div className="modal-field">
          <label className="modal-label">Canale acquisizione</label>
          <input className="modal-input" value={canale} onChange={(e) => setCanale(e.target.value)} placeholder="Es: Ads, referral, organico…" />
        </div>

        <div className="modal-field">
          <label className="modal-label">Telefono alternativo</label>
          <input className="modal-input" value={telefonoAlt} onChange={(e) => setTelefonoAlt(e.target.value)} placeholder="Se diverso dal quiz" />
        </div>

        <div className="modal-field admin-crm-span2">
          <label className="modal-label">Note interne</label>
          <textarea
            className="modal-textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Note interne (visibili solo admin)."
          />
        </div>

        <div className="modal-field admin-crm-span2">
          <label className="modal-label">Note chiamata / follow-up</label>
          <textarea className="modal-textarea" value={noteChiamata} onChange={(e) => setNoteChiamata(e.target.value)} placeholder="Es: chiamare venerdi, inviare preventivo…" />
        </div>
      </div>

      <div className="action-buttons" style={{ marginTop: 4 }}>
        <button type="button" className="btn-action primary" onClick={save} disabled={saving || loading}>
          {saving ? 'Salvataggio…' : 'Salva'}
        </button>
      </div>
    </section>
  );
}
