type AtomicPageLoaderProps = {
  title?: string;
  targetWord?: string;
  className?: string;
};

export function AtomicPageLoader({
  title = 'Sto caricando',
  targetWord = 'pagina',
  className,
}: AtomicPageLoaderProps) {
  const normalizedTarget = String(targetWord || 'pagina').trim().toLowerCase();
  const pool = ['pratiche', 'messaggi', 'profilo', 'nuova pratica', 'scanner', 'quiz', 'documenti', 'dashboard'];
  const alternates = pool.filter((word) => word !== normalizedTarget).slice(0, 4);
  while (alternates.length < 4) alternates.push('dashboard');
  // Keep target only at the end so animation lands on the final page word.
  const rotatingWords = [...alternates, normalizedTarget];

  return (
    <section className={className ? `atomic-loader ${className}` : 'atomic-loader'} role="status" aria-live="polite">
      <div className="atomic-loader-card atomic-loader-uiverse-card">
        <div className="atomic-loader-uiverse-loader">
          <p className="atomic-loader-uiverse-title">{title}</p>
          <div className="atomic-loader-uiverse-words" aria-hidden="true">
            {rotatingWords.map((word, index) => (
              <span key={`${word}-${index}`} className="atomic-loader-uiverse-word">
                {word}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
