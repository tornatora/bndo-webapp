export default function DashboardLoading() {
  return (
    <div className="space-y-4">
      <section className="welcome-section">
        <div style={{ height: 28, width: 180, borderRadius: 10, background: 'rgba(11,17,54,0.06)' }} />
        <div style={{ height: 16, width: 260, borderRadius: 10, background: 'rgba(11,17,54,0.05)', marginTop: 10 }} />
        <div className="stats-grid" style={{ opacity: 0.9 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="stat-item">
              <div style={{ height: 26, width: 40, borderRadius: 10, background: 'rgba(11,17,54,0.06)' }} />
              <div style={{ height: 12, width: 120, borderRadius: 10, background: 'rgba(11,17,54,0.05)', marginTop: 10 }} />
            </div>
          ))}
        </div>
      </section>

      {[0, 1].map((i) => (
        <div key={i} className="pratica-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ height: 20, width: 220, borderRadius: 10, background: 'rgba(11,17,54,0.06)' }} />
            <div style={{ height: 22, width: 110, borderRadius: 999, background: 'rgba(11,17,54,0.05)' }} />
          </div>
          <div style={{ height: 12, width: 260, borderRadius: 10, background: 'rgba(11,17,54,0.05)', marginTop: 14 }} />
          <div style={{ height: 10, width: '100%', borderRadius: 999, background: 'rgba(11,17,54,0.05)', marginTop: 12 }} />
        </div>
      ))}
    </div>
  );
}

