'use client';

import { useEffect } from 'react';

export function ViewportSync() {
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    let raf = 0;

    const isEditableActiveElement = () => {
      const active = document.activeElement as HTMLElement | null;
      if (!active) return false;
      const tag = active.tagName;
      if (tag === 'TEXTAREA') return true;
      if (tag === 'SELECT') return true;
      if (active.isContentEditable) return true;
      if (tag !== 'INPUT') return false;
      const input = active as HTMLInputElement;
      if (input.disabled || input.readOnly) return false;
      const disallowed = new Set(['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'file', 'color']);
      return !disallowed.has((input.type || 'text').toLowerCase());
    };

    const sync = () => {
      const viewport = window.visualViewport;
      const rawViewportHeight = Math.round(viewport?.height ?? window.innerHeight);
      const viewportOffsetTop = Math.round(viewport?.offsetTop ?? 0);
      const nextHeight = Math.max(0, Math.min(window.innerHeight, rawViewportHeight + viewportOffsetTop));

      root.style.setProperty('--app-height', `${nextHeight}px`);
      root.style.setProperty('--viewport-h', `${nextHeight}px`);

      const isMobile = window.matchMedia('(max-width: 1023px)').matches;
      const keyboardDelta = window.innerHeight - rawViewportHeight;
      const hasEditableFocus = isEditableActiveElement();
      const viewportShrunk = rawViewportHeight < window.innerHeight - 16;
      const keyboardLikely =
        isMobile && (keyboardDelta > 120 || (hasEditableFocus && (keyboardDelta > 0 || viewportShrunk)));
      root.classList.toggle('keyboard-open', keyboardLikely);
      body.classList.toggle('keyboard-open', keyboardLikely);
    };

    const queueSync = () => {
      cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(sync);
    };

    sync();
    window.addEventListener('resize', queueSync, { passive: true });
    window.addEventListener('orientationchange', queueSync, { passive: true });
    window.addEventListener('focus', queueSync, { passive: true, capture: true });
    document.addEventListener('focusin', queueSync, { passive: true });
    document.addEventListener('focusout', queueSync, { passive: true });
    window.visualViewport?.addEventListener('resize', queueSync, { passive: true });
    window.visualViewport?.addEventListener('scroll', queueSync, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', queueSync);
      window.removeEventListener('orientationchange', queueSync);
      window.removeEventListener('focus', queueSync, true);
      document.removeEventListener('focusin', queueSync);
      document.removeEventListener('focusout', queueSync);
      window.visualViewport?.removeEventListener('resize', queueSync);
      window.visualViewport?.removeEventListener('scroll', queueSync);
      root.classList.remove('keyboard-open');
      body.classList.remove('keyboard-open');
    };
  }, []);

  return null;
}
