'use client';

import { useEffect, useMemo, useState } from 'react';

type CoreInfo = {
  company: {
    id: string;
    name: string;
    vat_number: string | null;
    industry: string | null;
    annual_spend_target: number | null;
  };
  profile: {
    id: string;
    email: string;
    full_name: string;
    username: string;
  } | null;
};

export function AdminClientCoreInfoForm({
  initial,
  isMock
}: {
  initial: CoreInfo;
  isMock: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState(initial.company.name);
  const [vatNumber, setVatNumber] = useState(initial.company.vat_number ?? '');
  const [industry, setIndustry] = useState(initial.company.industry ?? '');
  const [annualSpend, setAnnualSpend] = useState(initial.company.annual_spend_target?.toString() ?? '');

  const [fullName, setFullName] = useState(initial.profile?.full_name ?? '');
  const [username, setUsername] = useState(initial.profile?.username ?? '');

  const [acquisitionChannel, setAcquisitionChannel] = useState('');
  const [referralName, setReferralName] = useState('');

  const [phone, setPhone] = useState('');
  const [pec, setPec] = useState('');
  const [sdi, setSdi] = useState('');
  const [ateco, setAteco] = useState('');
  const [legalForm, setLegalForm] = useState('');
  const [iban, setIban] = useState('');
  const [hqAddress, setHqAddress] = useState('');
  const [hqCity, setHqCity] = useState('');
  const [hqProvince, setHqProvince] = useState('');
  const [hqZip, setHqZip] = useState('');
  const [projectSummary, setProjectSummary] = useState('');

  const payload = useMemo(
    () => ({
      companyId: initial.company.id,
      company: {
        name: companyName.trim(),
        vat_number: vatNumber.trim() || null,
        industry: industry.trim() || null,
        annual_spend_target: annualSpend.trim() ? Number(annualSpend.replace(',', '.')) : null
      },
      profile: initial.profile
        ? {
            id: initial.profile.id,
            full_name: fullName.trim(),
            username: username.trim()
          }
        : null
    }),
    [initial.company.id, initial.profile, companyName, vatNumber, industry, annualSpend, fullName, username]
  );

  async function loadExtraFields() {
    try {
      if (isMock) {
        const raw = localStorage.getItem(`bndo:crm:${initial.company.id}`);
        if (!raw) return;
        const parsed = JSON.parse(raw) as { admin_fields?: Record<string, string> };
        const f = parsed.admin_fields ?? {};
        setAcquisitionChannel(f.canale ?? '');
        setReferralName(f.referral_name ?? '');
        setPhone(f.phone ?? '');
        setPec(f.pec ?? '');
        setSdi(f.sdi ?? '');
        setAteco(f.ateco ?? '');
        setLegalForm(f.legal_form ?? '');
        setIban(f.iban ?? '');
        setHqAddress(f.hq_address ?? '');
        setHqCity(f.hq_city ?? '');
        setHqProvince(f.hq_province ?? '');
        setHqZip(f.hq_zip ?? '');
        setProjectSummary(f.project_summary ?? '');
        return;
      }

      const res = await fetch(`/api/admin/company-crm?companyId=${encodeURIComponent(initial.company.id)}`, { cache: 'no-store' });
      const json = (await res.json()) as { data?: { admin_fields?: Record<string, string> } | null };
      const fields = json?.data?.admin_fields ?? {};
      setAcquisitionChannel(fields.canale ?? '');
      setReferralName(fields.referral_name ?? '');
      setPhone(fields.phone ?? '');
      setPec(fields.pec ?? '');
      setSdi(fields.sdi ?? '');
      setAteco(fields.ateco ?? '');
      setLegalForm(fields.legal_form ?? '');
      setIban(fields.iban ?? '');
      setHqAddress(fields.hq_address ?? '');
      setHqCity(fields.hq_city ?? '');
      setHqProvince(fields.hq_province ?? '');
      setHqZip(fields.hq_zip ?? '');
      setProjectSummary(fields.project_summary ?? '');
    } catch {
      // Non blocchiamo la scheda se questi due campi non arrivano.
    }
  }

  // Load "canale/referral" once when opening the sheet.
  useEffect(() => {
    void loadExtraFields();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      if (!payload.company.name) throw new Error('Nome azienda obbligatorio.');
      if (payload.company.annual_spend_target !== null && Number.isNaN(payload.company.annual_spend_target)) {
        throw new Error('Spesa target non valida.');
      }
      if (payload.profile) {
        if (!payload.profile.full_name) throw new Error('Nome cliente obbligatorio.');
        if (!payload.profile.username) throw new Error('Username obbligatorio.');
      }

      if (isMock) {
        localStorage.setItem(`bndo:core:${payload.companyId}`, JSON.stringify(payload));
        localStorage.setItem(
          `bndo:crm:${payload.companyId}`,
          JSON.stringify({
            admin_fields: {
              canale: acquisitionChannel.trim(),
              referral_name: referralName.trim(),
              phone: phone.trim(),
              pec: pec.trim(),
              sdi: sdi.trim(),
              ateco: ateco.trim(),
              legal_form: legalForm.trim(),
              iban: iban.trim(),
              hq_address: hqAddress.trim(),
              hq_city: hqCity.trim(),
              hq_province: hqProvince.trim(),
              hq_zip: hqZip.trim(),
              project_summary: projectSummary.trim()
            }
          })
        );
        setOk('Salvato (mock).');
        setEditing(false);
        return;
      }

      const res = await fetch('/api/admin/client-info', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json?.error ?? 'Salvataggio non riuscito.');

      // Save acquisition/referral in company_crm.admin_fields (internal-only, but part of the same "scheda cliente").
      await fetch('/api/admin/company-crm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          companyId: payload.companyId,
          admin_fields: {
            canale: acquisitionChannel.trim(),
            referral_name: referralName.trim(),
            phone: phone.trim(),
            pec: pec.trim(),
            sdi: sdi.trim(),
            ateco: ateco.trim(),
            legal_form: legalForm.trim(),
            iban: iban.trim(),
            hq_address: hqAddress.trim(),
            hq_city: hqCity.trim(),
            hq_province: hqProvince.trim(),
            hq_zip: hqZip.trim(),
            project_summary: projectSummary.trim()
          }
        })
      });

      setOk('Salvato.');
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore salvataggio.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {error ? (
        <div className="admin-item-sub" style={{ color: '#B91C1C', fontWeight: 500, marginBottom: 10 }}>
          {error}
        </div>
      ) : null}
      {ok ? (
        <div className="admin-item-sub" style={{ color: '#065F46', fontWeight: 500, marginBottom: 10 }}>
          {ok}
        </div>
      ) : null}

      {!editing ? (
        <>
          <div className="admin-kv-grid">
            <div className="admin-kv">
              <div className="admin-kv-label">Ragione sociale</div>
              <div className="admin-kv-value">{companyName || 'N/D'}</div>
            </div>
            <div className="admin-kv">
              <div className="admin-kv-label">Email</div>
              <div className="admin-kv-value">{initial.profile?.email ?? 'N/D'}</div>
            </div>
            <div className="admin-kv">
              <div className="admin-kv-label">Nome e cognome</div>
              <div className="admin-kv-value">{fullName || 'N/D'}</div>
            </div>
            <div className="admin-kv">
              <div className="admin-kv-label">Username</div>
              <div className="admin-kv-value">{username || 'N/D'}</div>
            </div>
            <div className="admin-kv">
              <div className="admin-kv-label">P.IVA</div>
              <div className="admin-kv-value">{vatNumber || 'N/D'}</div>
            </div>
            <div className="admin-kv">
              <div className="admin-kv-label">Settore</div>
              <div className="admin-kv-value">{industry || 'N/D'}</div>
            </div>
            <div className="admin-kv">
              <div className="admin-kv-label">Spesa target</div>
              <div className="admin-kv-value">{annualSpend ? `${annualSpend} €` : 'N/D'}</div>
            </div>
            <div className="admin-kv">
              <div className="admin-kv-label">Telefono</div>
              <div className="admin-kv-value">{phone || 'N/D'}</div>
            </div>
            <div className="admin-kv">
              <div className="admin-kv-label">PEC</div>
              <div className="admin-kv-value">{pec || 'N/D'}</div>
            </div>
            <div className="admin-kv">
              <div className="admin-kv-label">SDI</div>
              <div className="admin-kv-value">{sdi || 'N/D'}</div>
            </div>
            <div className="admin-kv">
              <div className="admin-kv-label">ATECO</div>
              <div className="admin-kv-value">{ateco || 'N/D'}</div>
            </div>
            <div className="admin-kv">
              <div className="admin-kv-label">Forma giuridica</div>
              <div className="admin-kv-value">{legalForm || 'N/D'}</div>
            </div>
            <div className="admin-kv admin-kv-span2">
              <div className="admin-kv-label">IBAN</div>
              <div className="admin-kv-value">{iban || 'N/D'}</div>
            </div>
            <div className="admin-kv admin-kv-span2">
              <div className="admin-kv-label">Sede legale</div>
              <div className="admin-kv-value">
                {[hqAddress, hqZip, hqCity, hqProvince].filter(Boolean).join(', ') || 'N/D'}
              </div>
            </div>
            <div className="admin-kv admin-kv-span2">
              <div className="admin-kv-label">Sintesi del progetto</div>
              <div className="admin-kv-value">{projectSummary || 'N/D'}</div>
            </div>
            <div className="admin-kv">
              <div className="admin-kv-label">Canale acquisizione</div>
              <div className="admin-kv-value">{acquisitionChannel || 'N/D'}</div>
            </div>
            <div className="admin-kv">
              <div className="admin-kv-label">Referral name</div>
              <div className="admin-kv-value">{referralName || 'N/D'}</div>
            </div>
          </div>

          <div className="action-buttons" style={{ marginTop: 12 }}>
            <button type="button" className="btn-action" onClick={() => setEditing(true)}>
              Modifica
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="admin-crm-grid" aria-busy={saving ? 'true' : 'false'}>
            <div className="modal-field">
              <label className="modal-label">Ragione sociale</label>
              <input className="modal-input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div className="modal-field">
              <label className="modal-label">Email (non modificabile)</label>
              <input className="modal-input" value={initial.profile?.email ?? 'N/D'} disabled />
            </div>

            <div className="modal-field">
              <label className="modal-label">Nome e cognome</label>
              <input className="modal-input" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={!initial.profile} />
            </div>
            <div className="modal-field">
              <label className="modal-label">Username</label>
              <input className="modal-input" value={username} onChange={(e) => setUsername(e.target.value)} disabled={!initial.profile} />
            </div>

            <div className="modal-field">
              <label className="modal-label">P.IVA</label>
              <input className="modal-input" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="IT…" />
            </div>
            <div className="modal-field">
              <label className="modal-label">Settore</label>
              <input className="modal-input" value={industry} onChange={(e) => setIndustry(e.target.value)} />
            </div>

            <div className="modal-field">
              <label className="modal-label">Spesa target (EUR)</label>
              <input className="modal-input" inputMode="decimal" value={annualSpend} onChange={(e) => setAnnualSpend(e.target.value)} placeholder="Es: 10000" />
            </div>

            <div className="modal-field">
              <label className="modal-label">Telefono</label>
              <input className="modal-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="modal-field">
              <label className="modal-label">PEC</label>
              <input className="modal-input" value={pec} onChange={(e) => setPec(e.target.value)} />
            </div>
            <div className="modal-field">
              <label className="modal-label">SDI</label>
              <input className="modal-input" value={sdi} onChange={(e) => setSdi(e.target.value)} />
            </div>
            <div className="modal-field">
              <label className="modal-label">ATECO</label>
              <input className="modal-input" value={ateco} onChange={(e) => setAteco(e.target.value)} placeholder="Es: 62.01.00" />
            </div>
            <div className="modal-field">
              <label className="modal-label">Forma giuridica</label>
              <input className="modal-input" value={legalForm} onChange={(e) => setLegalForm(e.target.value)} placeholder="Es: SRL" />
            </div>
            <div className="modal-field">
              <label className="modal-label">IBAN</label>
              <input className="modal-input" value={iban} onChange={(e) => setIban(e.target.value)} placeholder="IT…" />
            </div>

            <div className="modal-field admin-crm-span2">
              <label className="modal-label">Sede legale (indirizzo)</label>
              <input className="modal-input" value={hqAddress} onChange={(e) => setHqAddress(e.target.value)} />
            </div>
            <div className="modal-field">
              <label className="modal-label">Comune</label>
              <input className="modal-input" value={hqCity} onChange={(e) => setHqCity(e.target.value)} />
            </div>
            <div className="modal-field">
              <label className="modal-label">Provincia</label>
              <input className="modal-input" value={hqProvince} onChange={(e) => setHqProvince(e.target.value)} placeholder="Es: MI" />
            </div>
            <div className="modal-field">
              <label className="modal-label">CAP</label>
              <input className="modal-input" value={hqZip} onChange={(e) => setHqZip(e.target.value)} placeholder="Es: 20100" />
            </div>

            <div className="modal-field admin-crm-span2">
              <label className="modal-label">Sintesi del progetto</label>
              <textarea
                className="modal-textarea"
                value={projectSummary}
                onChange={(e) => setProjectSummary(e.target.value)}
                placeholder="Descrizione breve del progetto che il cliente vuole realizzare."
              />
            </div>

            <div className="modal-field">
              <label className="modal-label">Canale di acquisizione</label>
              <input className="modal-input" value={acquisitionChannel} onChange={(e) => setAcquisitionChannel(e.target.value)} placeholder="Es: Ads, organico, referral…" />
            </div>

            <div className="modal-field">
              <label className="modal-label">Referral name (opzionale)</label>
              <input className="modal-input" value={referralName} onChange={(e) => setReferralName(e.target.value)} placeholder="Nome di chi lo ha invitato" />
            </div>
          </div>

          <div className="action-buttons" style={{ marginTop: 12 }}>
            <button type="button" className="btn-action primary" onClick={save} disabled={saving}>
              {saving ? 'Salvataggio…' : 'Salva'}
            </button>
            <button type="button" className="btn-action" onClick={() => setEditing(false)} disabled={saving}>
              Annulla
            </button>
          </div>
        </>
      )}
    </div>
  );
}
