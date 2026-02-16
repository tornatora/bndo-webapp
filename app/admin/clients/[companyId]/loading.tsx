export default function AdminClientLoading() {
  return (
    <div className="dashboard-shell-client admin-shell-admin">
      <aside className="dashboard-sidebar-client">
        <div className="main-tabs">
          <div className="main-tabs-container" style={{ padding: 16 }}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: 42,
                  borderRadius: 12,
                  background: 'rgba(11,17,54,0.05)',
                  marginBottom: 10
                }}
              />
            ))}
          </div>
        </div>
      </aside>

      <main className="dashboard-content dashboard-content-client">
        <section className="welcome-section">
          <div style={{ height: 28, width: 220, borderRadius: 10, background: 'rgba(11,17,54,0.06)' }} />
          <div style={{ height: 16, width: 260, borderRadius: 10, background: 'rgba(11,17,54,0.05)', marginTop: 10 }} />
        </section>

        <section className="section-card" style={{ minHeight: 380 }} />
      </main>
    </div>
  );
}

