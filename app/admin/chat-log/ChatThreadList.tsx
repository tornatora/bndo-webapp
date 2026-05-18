'use client';

import { useState } from 'react';
import type { ThreadEntry, ThreadMessage } from './page';

export function ChatThreadList({
  threads,
  messagesByThread,
}: {
  threads: ThreadEntry[];
  messagesByThread: Record<string, ThreadMessage[]>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {threads.map((thread) => {
        const isExpanded = expandedId === thread.id;
        const messages = messagesByThread[thread.id] || [];
        const lastActivity = new Date(thread.lastActivity);
        const dateLabel = Number.isNaN(lastActivity.getTime())
          ? thread.lastActivity
          : lastActivity.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

        return (
          <div key={thread.id}>
            {/* Thread row */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : thread.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', textAlign: 'left',
                padding: '12px 16px', borderRadius: isExpanded ? '12px 12px 0 0' : 12,
                background: isExpanded ? '#F8FAFC' : '#fff',
                border: isExpanded ? '0.5px solid rgba(11,17,54,0.12)' : '0.5px solid rgba(11,17,54,0.06)',
                borderBottom: isExpanded ? 'none' : '0.5px solid rgba(11,17,54,0.06)',
                cursor: 'pointer',
                transition: 'all .15s',
                fontSize: 'inherit',
                fontFamily: 'inherit',
                color: '#0B1136',
              }}
            >
              {/* Type icon */}
              <span style={{
                width: 32, height: 32, borderRadius: 8,
                background: thread.threadType === 'practice' ? '#DBEAFE' : '#F0FDF4',
                color: thread.threadType === 'practice' ? '#2563EB' : '#16A34A',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>
                {thread.threadType === 'practice' ? 'P' : 'C'}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#0B1136' }}>
                    {thread.companyName}
                  </span>
                  <span style={{
                    fontSize: 9, padding: '1px 6px', borderRadius: 4, fontWeight: 500,
                    background: thread.threadType === 'practice' ? '#DBEAFE' : '#F0FDF4',
                    color: thread.threadType === 'practice' ? '#2563EB' : '#16A34A',
                  }}>
                    {thread.threadType === 'practice' ? 'Pratica' : 'Chat'}
                  </span>
                  {thread.practiceType && (
                    <span style={{ fontSize: 9, color: 'rgba(11,17,54,0.35)' }}>
                      {thread.practiceType === 'resto-al-sud-2-0' ? 'Resto al Sud 2.0' : thread.practiceType === 'autoimpiego-centro-nord' ? 'Autoimpiego CN' : thread.practiceType}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(11,17,54,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {thread.lastMessage || 'Nessun messaggio'}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#0B1136' }}>
                  {thread.messageCount}
                </span>
                <span style={{ fontSize: 10, color: 'rgba(11,17,54,0.35)', whiteSpace: 'nowrap' }}>
                  {dateLabel}
                </span>
              </div>

              <span style={{
                fontSize: 10, color: 'rgba(11,17,54,0.3)',
                transform: isExpanded ? 'rotate(180deg)' : 'none',
                transition: 'transform .2s',
                flexShrink: 0,
              }}>
                ▼
              </span>
            </button>

            {/* Expanded messages */}
            {isExpanded && (
              <div style={{
                border: '0.5px solid rgba(11,17,54,0.12)',
                borderTop: 'none',
                borderRadius: '0 0 12px 12px',
                background: '#FAFBFC',
                maxHeight: 500,
                overflowY: 'auto',
              }}>
                {messages.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'rgba(11,17,54,0.35)' }}>
                    Nessun messaggio in questa conversazione.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', padding: '8px 16px 14px' }}>
                    {messages.map((msg, i) => {
                      const msgDate = new Date(msg.createdAt);
                      const msgTime = Number.isNaN(msgDate.getTime())
                        ? ''
                        : msgDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
                      const roleLabel =
                        msg.senderRole === 'client_admin' ? 'Cliente'
                          : msg.senderRole === 'consultant' ? 'Consulente'
                          : msg.senderRole === 'ops_admin' ? 'Admin'
                          : '';

                      return (
                        <div key={msg.id || i} style={{
                          display: 'flex', gap: 10,
                          padding: '8px 0',
                          borderBottom: i < messages.length - 1 ? '0.5px solid rgba(11,17,54,0.04)' : 'none',
                        }}>
                          <span style={{
                            width: 26, height: 26, borderRadius: 7,
                            background: msg.senderRole === 'ops_admin' ? '#0B1136'
                              : msg.senderRole === 'consultant' ? '#DBEAFE'
                              : '#F1F2F4',
                            color: msg.senderRole === 'ops_admin' ? '#fff'
                              : msg.senderRole === 'consultant' ? '#2563EB'
                              : 'rgba(11,17,54,0.5)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 700, flexShrink: 0,
                            marginTop: 1,
                          }}>
                            {msg.senderName.charAt(0).toUpperCase()}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#0B1136' }}>
                                {msg.senderName}
                              </span>
                              {roleLabel && (
                                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#F1F2F4', color: 'rgba(11,17,54,0.4)' }}>
                                  {roleLabel}
                                </span>
                              )}
                              <span style={{ fontSize: 10, color: 'rgba(11,17,54,0.3)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                                {msgTime}
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: 'rgba(11,17,54,0.65)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {msg.body}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
