export default function DashboardMessagesLoading() {
  return (
    <div className="space-y-4">
      <section className="welcome-section chat-hero">
        <div style={{ height: 28, width: 140, borderRadius: 10, background: 'rgba(11,17,54,0.06)' }} />
        <div style={{ height: 16, width: 280, borderRadius: 10, background: 'rgba(11,17,54,0.05)', marginTop: 10 }} />
      </section>

      <div className="chat-page">
        <div className="panel p-5 sm:p-6" style={{ minHeight: 420 }}>
          <div style={{ height: 12, width: 200, borderRadius: 10, background: 'rgba(11,17,54,0.05)' }} />
          <div style={{ height: 12, width: 240, borderRadius: 10, background: 'rgba(11,17,54,0.05)', marginTop: 10 }} />
          <div style={{ height: 12, width: 180, borderRadius: 10, background: 'rgba(11,17,54,0.05)', marginTop: 10 }} />
        </div>
      </div>
    </div>
  );
}

