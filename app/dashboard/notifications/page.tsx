import { redirect } from 'next/navigation';
import { requireUserProfile } from '@/lib/auth';
import { hasOpsAccess } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';

type NotificationRecord = {
  id: string;
  body: string;
  created_at: string;
};

export default async function DashboardNotificationsPage() {
  const { profile } = await requireUserProfile();

  if (hasOpsAccess(profile.role)) {
    redirect('/admin');
  }

  if (!profile.company_id) {
    return (
      <section className="welcome-section">
        <h1 className="welcome-title">Profilo non valido</h1>
        <p className="welcome-subtitle">Profilo non associato ad alcuna azienda. Contatta il supporto.</p>
      </section>
    );
  }

  const supabase = createClient();
  const { data: existingThread } = await supabase
    .from('consultant_threads')
    .select('id')
    .eq('company_id', profile.company_id)
    .maybeSingle();

  const threadId = existingThread?.id ?? null;

  if (!threadId) {
    return (
      <>
        <section className="welcome-section">
          <h1 className="welcome-title">Notifiche</h1>
          <p className="welcome-subtitle">Qui trovi aggiornamenti e messaggi del tuo consulente.</p>
        </section>

        <div className="empty-state">
          <div className="empty-icon">🔔</div>
          <p className="empty-text">Nessuna notifica disponibile.</p>
        </div>
      </>
    );
  }

  const [{ data: messages }, { data: participant }] = await Promise.all([
    supabase
      .from('consultant_messages')
      .select('id, body, created_at')
      .eq('thread_id', threadId)
      .neq('sender_profile_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(60),
    supabase
      .from('consultant_thread_participants')
      .select('last_read_at')
      .eq('thread_id', threadId)
      .eq('profile_id', profile.id)
      .maybeSingle()
  ]);

  const notificationItems: NotificationRecord[] = (messages ?? []) as NotificationRecord[];
  const lastReadAt = participant?.last_read_at ?? new Date(0).toISOString();
  const lastReadTime = new Date(lastReadAt).getTime();
  const unreadCount = notificationItems.filter(
    (item) => new Date(item.created_at).getTime() > lastReadTime
  ).length;

  return (
    <>
      <section className="welcome-section">
        <h1 className="welcome-title">Notifiche</h1>
        <p className="welcome-subtitle">
          {unreadCount > 0
            ? `Hai ${unreadCount} notifica${unreadCount === 1 ? '' : 'he'} non lett${unreadCount === 1 ? 'a' : 'e'}.`
            : 'Tutte le notifiche sono state lette.'}
        </p>
      </section>

      <section className="welcome-section">
        {notificationItems.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">✅</div>
            <p className="empty-text">Nessuna nuova notifica.</p>
          </div>
        ) : (
          <div className="notifications-feed">
            {notificationItems.map((notification) => {
              const isUnread = new Date(notification.created_at).getTime() > lastReadTime;

              return (
                <article
                  key={notification.id}
                  className={`notifications-feed-item ${isUnread ? 'is-unread' : ''}`}
                >
                  <div className="notifications-feed-title">Messaggio consulente</div>
                  <p className="notifications-feed-body">{notification.body}</p>
                  <div className="notifications-feed-time">
                    {new Date(notification.created_at).toLocaleString('it-IT')}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
