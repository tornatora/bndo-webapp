'use client';

import { useEffect, useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

declare global {
  interface Window {
    bndoTrackEvent?: (eventType: string, payload?: Record<string, unknown>) => void;
  }
}

function ensureSessionId() {
  try {
    const key = 'bndo_session_id';
    const existing = window.localStorage.getItem(key);
    if (existing && existing.length >= 8) return existing;
    const created = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(key, created);
    return created;
  } catch {
    return `sess_${Date.now().toString(36)}`;
  }
}

async function sendEvent(eventType: string, payload: Record<string, unknown>) {
  try {
    await fetch('/api/telemetry/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        eventType,
        ...payload,
      }),
    });
  } catch {
    // Silent by design
  }
}

export function ClientTelemetry() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pagePath = useMemo(() => {
    const q = searchParams?.toString();
    return q ? `${pathname}?${q}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    const sessionId = ensureSessionId();
    sendEvent('page_view', {
      sessionId,
      pagePath,
      channel: pathname?.startsWith('/admin') ? 'admin' : pathname?.startsWith('/consultant') ? 'consultant' : 'web',
    });
  }, [pagePath, pathname]);

  useEffect(() => {
    const sessionId = ensureSessionId();
    window.bndoTrackEvent = (eventType: string, payload?: Record<string, unknown>) => {
      sendEvent(eventType, {
        sessionId,
        pagePath: window.location.pathname + window.location.search,
        channel: window.location.pathname.startsWith('/admin')
          ? 'admin'
          : window.location.pathname.startsWith('/consultant')
            ? 'consultant'
            : 'web',
        metadata: payload ?? {},
      });
    };
    return () => {
      delete window.bndoTrackEvent;
    };
  }, []);

  // Auto-logout after 30 minutes of inactivity
  useEffect(() => {
    const INACTIVITY_MS = 30 * 60 * 1000; // 30 minuti
    let logoutTimer: ReturnType<typeof setTimeout>;

    function resetTimer() {
      clearTimeout(logoutTimer);
      logoutTimer = setTimeout(async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST', keepalive: true });
        } catch {
          // Best effort
        }
        window.location.href = '/login?error=Sessione%20scaduta%20per%20inattivit%C3%A0';
      }, INACTIVITY_MS);
    }

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
    for (const evt of events) {
      window.addEventListener(evt, resetTimer, { passive: true });
    }
    resetTimer();

    return () => {
      clearTimeout(logoutTimer);
      for (const evt of events) {
        window.removeEventListener(evt, resetTimer);
      }
    };
  }, []);

  return null;
}

