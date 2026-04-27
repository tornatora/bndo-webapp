'use client';

import { useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';

export function useConfetti() {
  const launchedRef = useRef(false);

  const launch = useCallback(() => {
    if (launchedRef.current) return;
    launchedRef.current = true;

    const colors = ['#22c55f', '#0b1136', '#16a34a', '#ffffff', '#64748b'];

    // First burst — main
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.7 },
      colors,
    });

    // Second burst — left
    setTimeout(() => {
      confetti({
        particleCount: 60,
        spread: 100,
        origin: { y: 0.9, x: 0.2 },
        colors: ['#22c55f', '#16a34a'],
      });
    }, 300);

    // Third burst — right
    setTimeout(() => {
      confetti({
        particleCount: 60,
        spread: 100,
        origin: { y: 0.9, x: 0.8 },
        colors: ['#0b1136', '#22c55f'],
      });
    }, 600);
  }, []);

  const reset = useCallback(() => {
    launchedRef.current = false;
  }, []);

  return { launch, reset };
}
