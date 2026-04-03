export default function ConsultantLoading() {
  return (
    <section className="section-card">
      <div className="section-title">
        <span>Caricamento consulente</span>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            style={{
              height: 86,
              borderRadius: 16,
              border: '0.5px solid rgba(11,17,54,0.08)',
              background: 'rgba(11,17,54,0.03)',
            }}
          />
        ))}
      </div>
    </section>
  );
}
