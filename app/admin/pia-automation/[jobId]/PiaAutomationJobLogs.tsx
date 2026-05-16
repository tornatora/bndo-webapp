'use client';

type LogEntry = { ts: string; level: 'info' | 'warn' | 'error'; msg: string };

export function PiaAutomationJobLogs({ logs }: { logs: LogEntry[] }) {
  if (!logs || logs.length === 0) {
    return (
      <div style={{ padding: 20, background: '#FAFBFC', borderRadius: 12, fontSize: 12, color: 'rgba(11,17,54,0.4)', textAlign: 'center' }}>
        Nessun log disponibile.
      </div>
    );
  }

  const levelColors: Record<string, string> = {
    info: 'rgba(11,17,54,0.6)',
    warn: '#D97706',
    error: '#DC2626',
  };

  const levelBg: Record<string, string> = {
    info: 'transparent',
    warn: 'rgba(217,119,6,0.06)',
    error: 'rgba(220,38,38,0.06)',
  };

  return (
    <div style={{
      background: '#FAFBFC',
      borderRadius: 12,
      border: '0.5px solid rgba(11,17,54,0.06)',
      maxHeight: 400,
      overflowY: 'auto',
      fontFamily: 'monospace',
      fontSize: 11,
      lineHeight: 1.6,
    }}>
      {logs.map((entry, i) => (
        <div
          key={i}
          style={{
            padding: '4px 14px',
            background: levelBg[entry.level] || 'transparent',
            borderBottom: i < logs.length - 1 ? '0.5px solid rgba(11,17,54,0.04)' : 'none',
            color: levelColors[entry.level] || 'rgba(11,17,54,0.6)',
          }}
        >
          <span style={{ color: 'rgba(11,17,54,0.3)', marginRight: 8 }}>
            {(entry.ts || '').split('T')[1]?.slice(0, 8) || entry.ts}
          </span>
          <span style={{ fontWeight: entry.level === 'error' ? 600 : 400 }}>
            {entry.msg}
          </span>
        </div>
      ))}
    </div>
  );
}
