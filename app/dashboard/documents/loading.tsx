export default function DashboardDocumentsLoading() {
  return (
    <div className="space-y-4">
      <section className="welcome-section">
        <div style={{ height: 28, width: 170, borderRadius: 10, background: 'rgba(11,17,54,0.06)' }} />
        <div style={{ height: 16, width: 300, borderRadius: 10, background: 'rgba(11,17,54,0.05)', marginTop: 10 }} />
      </section>

      {[0, 1].map((i) => (
        <div key={i} className="section-card" style={{ padding: 18 }}>
          <div style={{ height: 14, width: 80, borderRadius: 10, background: 'rgba(11,17,54,0.05)' }} />
          <div style={{ height: 22, width: 220, borderRadius: 10, background: 'rgba(11,17,54,0.06)', marginTop: 10 }} />
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            {[0, 1].map((j) => (
              <div key={j} style={{ height: 44, borderRadius: 12, background: 'rgba(11,17,54,0.04)' }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

