'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './BndiHomeView.module.css';

type Props = {
  onStart: () => void;
  onOpenScanner: () => void;
  onVerify?: (grantId?: string) => void;
  embedded?: boolean;
};

export function BndiHomeView({ onStart, onOpenScanner, onVerify, embedded }: Props) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [isFrameReady, setIsFrameReady] = useState(false);

  const bridgeIframe = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return () => {};
    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!win || !doc) return () => {};

    const bindOnce = (element: Element | null, key: string, handler: (event: Event) => void) => {
      if (!element) return;
      const html = element as HTMLElement;
      if (html.dataset[key] === '1') return;
      html.dataset[key] = '1';
      html.addEventListener('click', handler);
    };

    const redirectToLegacyQuiz = () => {
      window.location.assign('https://bndo.it/quiz/autoimpiego');
    };

    const wireButtons = () => {
      const chatCta =
        doc.querySelector('#inizia .btn-primary.btn-primary-white') ??
        Array.from(doc.querySelectorAll('a.btn-primary.btn-primary-white')).find((el) =>
          (el.textContent ?? '').toLowerCase().includes('chat ai')
        ) ??
        null;
      const scannerCta =
        doc.querySelector('#inizia .btn-secondary-light') ??
        Array.from(doc.querySelectorAll('a.btn-secondary-light')).find((el) =>
          (el.textContent ?? '').toLowerCase().includes('scanner')
        ) ??
        null;

      bindOnce(chatCta, 'bndoBridgeChat', (event) => {
        event.preventDefault();
        onStart();
      });

      bindOnce(scannerCta, 'bndoBridgeScanner', (event) => {
        event.preventDefault();
        onOpenScanner();
      });

      const verifyButtons = Array.from(doc.querySelectorAll('#bandi .bando-btn'));
      for (const button of verifyButtons) {
        bindOnce(button, 'bndoBridgeVerify', (event) => {
          event.preventDefault();
          event.stopPropagation();
          redirectToLegacyQuiz();
        });
      }
    };

    const verifyCaptureHandler = (event: Event) => {
      const target = event.target as Element | null;
      const verifyBtn = target?.closest?.('#bandi .bando-btn');
      if (!verifyBtn) return;
      event.preventDefault();
      event.stopPropagation();
      redirectToLegacyQuiz();
    };

    if (!doc.getElementById('bndo-home-iframe-bridge-style')) {
      const style = doc.createElement('style');
      style.id = 'bndo-home-iframe-bridge-style';
      style.textContent = `
        #bandi .bando-btn {
          overflow: hidden !important;
          isolation: isolate !important;
          -webkit-mask-image: -webkit-radial-gradient(white, black) !important;
        }
        #bandi .bando-btn::before {
          border-radius: inherit !important;
          pointer-events: none !important;
        }
        @media (max-width: 900px) {
          header#header nav {
            padding-left: calc(14px + 44px + 10px) !important;
          }
          html.bndo-header-docked header#header {
            top: calc(15px + env(safe-area-inset-top, 0px)) !important;
            left: 62px !important;
            right: auto !important;
            width: auto !important;
            max-width: calc(100vw - 76px) !important;
            border-radius: 14px !important;
            border: 1px solid rgba(11, 17, 54, 0.08) !important;
            box-shadow: 0 12px 26px rgba(11, 17, 54, 0.12) !important;
            background: rgba(255, 255, 255, 0.96) !important;
            transform: translateY(0) !important;
            transition: top 0.25s ease, left 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease !important;
            z-index: 9999 !important;
          }
          html.bndo-header-docked header#header nav {
            justify-content: flex-start !important;
            gap: 10px !important;
            padding: 6px 12px !important;
            min-height: 32px !important;
            margin: 0 !important;
            max-width: none !important;
          }
          html.bndo-header-docked header#header .nav-menu {
            display: none !important;
          }
          html.bndo-header-docked header#header .logo img {
            height: 20px !important;
          }
        }
      `;
      doc.head.appendChild(style);
    }

    const syncHeaderDock = () => {
      const isMobile = win.matchMedia('(max-width: 900px)').matches;
      if (!isMobile) {
        doc.documentElement.classList.remove('bndo-header-docked');
        return;
      }

      const frameScrollY = win.scrollY || doc.documentElement.scrollTop || doc.body.scrollTop || 0;
      const hostScrollY =
        frame.closest('.mainpane') instanceof HTMLElement ? frame.closest('.mainpane')!.scrollTop : 0;
      const y = Math.max(frameScrollY, hostScrollY);

      if (y > 8) {
        doc.documentElement.classList.add('bndo-header-docked');
      } else {
        doc.documentElement.classList.remove('bndo-header-docked');
      }
    };

    wireButtons();
    syncHeaderDock();
    doc.addEventListener('click', verifyCaptureHandler, true);

    const observer = new MutationObserver(() => {
      wireButtons();
    });
    observer.observe(doc.body, { childList: true, subtree: true });
    const hostScrollEl = frame.closest('.mainpane');
    win.addEventListener('scroll', syncHeaderDock, { passive: true });
    hostScrollEl?.addEventListener('scroll', syncHeaderDock, { passive: true });
    win.addEventListener('resize', syncHeaderDock);

    return () => {
      observer.disconnect();
      doc.removeEventListener('click', verifyCaptureHandler, true);
      win.removeEventListener('scroll', syncHeaderDock);
      hostScrollEl?.removeEventListener('scroll', syncHeaderDock);
      win.removeEventListener('resize', syncHeaderDock);
    };
  }, [onOpenScanner, onStart]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    let cleanup: (() => void) | undefined;
    const onLoad = () => {
      setIsFrameReady(true);
      cleanup?.();
      cleanup = bridgeIframe();
    };

    frame.addEventListener('load', onLoad);
    if (frame.contentDocument?.readyState === 'complete') {
      onLoad();
    }

    return () => {
      frame.removeEventListener('load', onLoad);
      cleanup?.();
    };
  }, [bridgeIframe]);

  void onVerify;

  return (
    <section className={embedded ? styles.hostEmbedded : styles.host}>
      <div
        className={[
          embedded ? styles.frameEmbedded : styles.frame,
          isFrameReady ? styles.frameStateReady : styles.frameStateLoading
        ].join(' ')}
      >
        <div className={styles.framePlaceholder} aria-hidden={isFrameReady} />
        <iframe
          ref={frameRef}
          src="/bndo_landing_v218_mobile_dashboard_dashboard_final_polish.html"
          title="BNDO Landing v218"
          className={styles.landingFrame}
          loading="eager"
        />
      </div>
    </section>
  );
}
