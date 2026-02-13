'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

export type ClientListItem = {
  companyId: string;
  companyName: string;
  vatNumber: string | null;
  industry: string | null;
  createdAt: string;
  clientEmail: string | null;
  clientFullName: string | null;
};

function initialsFromName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return 'C';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? 'C';
  const second = parts.length > 1 ? parts[1]?.[0] ?? '' : '';
  return `${first}${second}`.toUpperCase();
}

export function ClientsList({ initialClients }: { initialClients: ClientListItem[] }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialClients;
    return initialClients.filter((client) => {
      return (
        client.companyName.toLowerCase().includes(q) ||
        (client.clientEmail ?? '').toLowerCase().includes(q) ||
        (client.clientFullName ?? '').toLowerCase().includes(q) ||
        (client.vatNumber ?? '').toLowerCase().includes(q)
      );
    });
  }, [initialClients, search]);

  return (
    <div>
      <div className="search-bar">
        <span className="search-icon" aria-hidden="true">
          🔎
        </span>
        <input
          className="search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca per azienda, email, referente o P.IVA..."
        />
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🕵️</div>
          <p className="empty-text">Nessun cliente trovato.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {filtered.map((client) => (
            <Link key={client.companyId} href={`/admin/clients/${client.companyId}`} className="client-card">
              <div className="client-header">
                <div className="client-avatar" aria-hidden="true">
                  {initialsFromName(client.companyName)}
                </div>
                <div className="client-info">
                  <div className="client-name">{client.companyName}</div>
                  {client.clientEmail ? <div className="client-email">{client.clientEmail}</div> : null}
                  {client.clientFullName ? <div className="client-email">{client.clientFullName}</div> : null}
                </div>
                <span className="status-badge status-inactive">Apri</span>
              </div>

              <div className="client-meta">
                {client.vatNumber ? <span>P.IVA: {client.vatNumber}</span> : null}
                {client.industry ? <span>Settore: {client.industry}</span> : null}
                <span>Creato: {new Date(client.createdAt).toLocaleDateString('it-IT')}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

