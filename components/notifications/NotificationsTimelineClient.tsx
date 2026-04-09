'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type InboxItem = {
  id: string;
  eventType: string;
  eventGroup: 'lead_quiz' | 'pratiche' | 'documenti' | 'pagamenti' | 'chat' | 'consulenti' | 'sistema';
  priority: 'high' | 'medium';
  title: string;
  body: string;
  actionPath: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
};

type InboxGroup = {
  group: InboxItem['eventGroup'];
  label: string;
  items: InboxItem[];
};

type InboxResponse = {
  ok?: boolean;
  source?: 'inbox' | 'legacy';
  unreadCount?: number;
  items?: InboxItem[];
  groups?: InboxGroup[];
  notice?: string | null;
  error?: string;
};

const GROUP_FILTERS: Array<{ value: 'all' | InboxItem['eventGroup']; label: string }> = [
  { value: 'all', label: 'Tutti' },
  { value: 'lead_quiz', label: 'Lead/Quiz' },
  { value: 'pratiche', label: 'Pratiche' },
  { value: 'documenti', label: 'Documenti' },
  { value: 'pagamenti', label: 'Pagamenti' },
  { value: 'chat', label: 'Chat' },
  { value: 'consulenti', label: 'Consulenti' },
  { value: 'sistema', label: 'Sistema' }
];

function badgeColor(priority: InboxItem['priority']) {
  return priority === 'high'
    ? { border: '1px solid #ef4444', color: '#b91c1c', background: '#fef2f2' }
    : { border: '1px solid #94a3b8', color: '#334155', background: '#f8fafc' };
}

function leftBorderColor(priority: InboxItem['priority']) {
  return priority === 'high' ? '#ef4444' : '#94a3b8';
}

export function NotificationsTimelineClient({
  title,
  subtitle,
  defaultActionPath
}: {
  title: string;
  subtitle: string;
  defaultActionPath: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [groups, setGroups] = useState<InboxGroup[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [groupFilter, setGroupFilter] = useState<'all' | InboxItem['eventGroup']>('all');
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '120');
      if (unreadOnly) params.set('unreadOnly', '1');
      if (groupFilter !== 'all') params.set('group', groupFilter);

      const response = await fetch(`/api/notifications/inbox?${params.toString()}`, { cache: 'no-store' });
      const json = (await response.json().catch(() => ({}))) as InboxResponse;

      if (!response.ok) {
        throw new Error(json.error ?? 'Errore caricamento notifiche.');
      }

      setItems(json.items ?? []);
      setGroups(json.groups ?? []);
      setNotice(json.notice ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore caricamento notifiche.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadOnly, groupFilter]);

  const unreadCount = useMemo(() => items.filter((item) => !item.readAt).length, [items]);

  async function markRead(ids: string[], read: boolean) {
    if (ids.length === 0) return;
    setBusyIds((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, true])) }));
    try {
      const response = await fetch('/api/notifications/read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, read })
      });
      if (!response.ok) {
        const json = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? 'Impossibile aggiornare lo stato lettura.');
      }
      setItems((prev) =>
        prev.map((item) => (ids.includes(item.id) ? { ...item, readAt: read ? new Date().toISOString() : null } : item))
      );
      setGroups((prev) =>
        prev.map((group) => ({
          ...group,
          items: group.items.map((item) =>
            ids.includes(item.id) ? { ...item, readAt: read ? new Date().toISOString() : null } : item
          )
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossibile aggiornare stato notifica.');
    } finally {
      setBusyIds((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
    }
  }

  async function createTask(item: InboxItem) {
    const titleDraft = window.prompt('Titolo task da creare', item.title);
    if (!titleDraft) return;
    const descriptionDraft = window.prompt('Dettaglio task (opzionale)', item.body) ?? undefined;

    try {
      const response = await fetch('/api/notifications/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notificationId: item.id,
          title: titleDraft,
          description: descriptionDraft
        })
      });
      if (!response.ok) {
        const json = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? 'Impossibile creare task.');
      }
      alert('Task creato correttamente.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossibile creare task.');
    }
  }

  async function openNotification(item: InboxItem) {
    if (!item.readAt) {
      await markRead([item.id], true);
    }
    router.push(item.actionPath || defaultActionPath);
  }

  const content = (
    <div>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 14,
          padding: '12px 14px',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap'
        }}
      >
        <button
          type="button"
          onClick={() => setUnreadOnly((prev) => !prev)}
          style={{
            borderRadius: 999,
            border: unreadOnly ? '1px solid #0f172a' : '1px solid #cbd5e1',
            background: unreadOnly ? '#0f172a' : '#fff',
            color: unreadOnly ? '#fff' : '#0f172a',
            padding: '6px 12px',
            fontWeight: 700,
            fontSize: 12
          }}
        >
          {unreadOnly ? 'Solo non lette' : 'Mostra tutte'}
        </button>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {GROUP_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setGroupFilter(filter.value)}
              style={{
                borderRadius: 999,
                border: groupFilter === filter.value ? '1px solid #0f172a' : '1px solid #cbd5e1',
                background: groupFilter === filter.value ? '#eef2ff' : '#fff',
                color: '#0f172a',
                padding: '6px 10px',
                fontWeight: 600,
                fontSize: 12
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void markRead(items.filter((i) => !i.readAt).map((i) => i.id), true)}
          style={{
            marginLeft: 'auto',
            borderRadius: 10,
            border: '1px solid #cbd5e1',
            background: '#fff',
            color: '#0f172a',
            padding: '6px 12px',
            fontWeight: 600,
            fontSize: 12
          }}
        >
          Segna tutto letto
        </button>
      </div>

      {groups.filter((group) => group.items.length > 0).length === 0 && !loading ? (
        <div
          style={{
            marginTop: 18,
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            padding: 18,
            background: '#fff'
          }}
        >
          <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Nessuna notifica disponibile</div>
          <div style={{ color: '#475569', fontSize: 14 }}>Appena ci sono nuovi eventi, li trovi qui in timeline.</div>
        </div>
      ) : null}

      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <section key={group.group} style={{ marginTop: 20 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{group.label}</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              {group.items.map((item) => (
                <article
                  key={item.id}
                  style={{
                    border: `1px solid ${item.readAt ? '#e2e8f0' : '#cbd5e1'}`,
                    borderLeft: `6px solid ${leftBorderColor(item.priority)}`,
                    borderRadius: 12,
                    padding: 12,
                    background: item.readAt ? '#ffffff' : '#f8fafc',
                    display: 'grid',
                    gap: 8
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{item.title}</div>
                    <span
                      style={{
                        ...badgeColor(item.priority),
                        borderRadius: 999,
                        padding: '3px 8px',
                        fontSize: 11,
                        fontWeight: 700
                      }}
                    >
                      {item.priority === 'high' ? 'Alta' : 'Media'}
                    </span>
                  </div>
                  <div style={{ color: '#334155', fontSize: 14 }}>{item.body}</div>
                  <div style={{ color: '#64748b', fontSize: 12 }}>
                    {new Date(item.createdAt).toLocaleString('it-IT')} • {item.readAt ? 'Letta' : 'Non letta'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => void openNotification(item)}
                      style={{
                        borderRadius: 10,
                        border: '1px solid #0f172a',
                        background: '#0f172a',
                        color: '#fff',
                        padding: '7px 11px',
                        fontSize: 12,
                        fontWeight: 700
                      }}
                    >
                      Apri
                    </button>
                    <button
                      type="button"
                      onClick={() => void markRead([item.id], Boolean(item.readAt) ? false : true)}
                      disabled={Boolean(busyIds[item.id])}
                      style={{
                        borderRadius: 10,
                        border: '1px solid #cbd5e1',
                        background: '#fff',
                        color: '#0f172a',
                        padding: '7px 11px',
                        fontSize: 12,
                        fontWeight: 700,
                        opacity: busyIds[item.id] ? 0.65 : 1
                      }}
                    >
                      {item.readAt ? 'Segna non letto' : 'Segna letto'}
                    </button>
                    <details style={{ marginLeft: 'auto' }}>
                      <summary
                        style={{
                          cursor: 'pointer',
                          listStyle: 'none',
                          border: '1px solid #cbd5e1',
                          borderRadius: 10,
                          padding: '7px 11px',
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#0f172a'
                        }}
                      >
                        ...
                      </summary>
                      <button
                        type="button"
                        onClick={() => void createTask(item)}
                        style={{
                          marginTop: 8,
                          width: '100%',
                          border: '1px solid #cbd5e1',
                          borderRadius: 10,
                          background: '#fff',
                          color: '#0f172a',
                          padding: '8px 10px',
                          fontSize: 12,
                          fontWeight: 700
                        }}
                      >
                        Assegna task
                      </button>
                    </details>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
    </div>
  );

  return (
    <section className="welcome-section" style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h1 className="welcome-title" style={{ marginBottom: 4 }}>
            {title}
          </h1>
          <p className="welcome-subtitle" style={{ margin: 0 }}>
            {subtitle} • {unreadCount} non lett{unreadCount === 1 ? 'a' : 'e'}
          </p>
          {notice ? (
            <p style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
              {notice}
            </p>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => setFullscreenOpen(true)}
            style={{
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#0f172a',
              padding: '7px 11px',
              fontSize: 12,
              fontWeight: 700
            }}
          >
            Apri full-screen
          </button>
          <button
            type="button"
            onClick={() => void load()}
            style={{
              borderRadius: 10,
              border: '1px solid #0f172a',
              background: '#0f172a',
              color: '#fff',
              padding: '7px 11px',
              fontSize: 12,
              fontWeight: 700
            }}
          >
            Aggiorna
          </button>
        </div>
      </div>

      {error ? (
        <div style={{ border: '1px solid #fecaca', background: '#fff1f2', color: '#9f1239', borderRadius: 12, padding: 12 }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, background: '#fff', color: '#475569' }}>
          Caricamento timeline notifiche...
        </div>
      ) : (
        content
      )}

      {fullscreenOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 90,
            background: 'rgba(15, 23, 42, 0.62)',
            padding: 14,
            overflow: 'auto'
          }}
        >
          <div
            style={{
              maxWidth: 1080,
              margin: '0 auto',
              background: '#fff',
              borderRadius: 14,
              border: '1px solid #cbd5e1',
              padding: 14
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <strong style={{ color: '#0f172a' }}>Timeline notifiche</strong>
              <button
                type="button"
                onClick={() => setFullscreenOpen(false)}
                style={{
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#0f172a',
                  padding: '5px 10px',
                  fontSize: 12,
                  fontWeight: 700
                }}
              >
                Chiudi
              </button>
            </div>
            {content}
          </div>
        </div>
      ) : null}
    </section>
  );
}
