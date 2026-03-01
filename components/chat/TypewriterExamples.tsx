'use client';

import { useEffect, useMemo, useState } from 'react';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function TypewriterExamples() {
  const examples = useMemo(
    () => [
      'Es. Sono una startup e vorrei fondi per un sito web.',
      'Es. Ho una PMI in Calabria: voglio contributi per macchinari.',
      'Es. Sono un professionista: mi serve un voucher per formazione.',
      'Es. Ho un agriturismo: voglio incentivi per efficientamento energetico.',
      'Es. Apriro una nuova attivita: cerco fondo perduto per investimenti.'
    ],
    []
  );

  const [text, setText] = useState('');
  const [i, setI] = useState(0);
  const [mode, setMode] = useState<'type' | 'hold' | 'erase'>('type');

  useEffect(() => {
    let alive = true;

    async function loop() {
      const target = examples[i] ?? examples[0] ?? '';
      if (!target) return;

      if (mode === 'type') {
        // Type forward with slight jitter.
        for (let k = 0; k <= target.length; k++) {
          if (!alive) return;
          setText(target.slice(0, k));
          await sleep(18 + Math.floor(Math.random() * 26));
        }
        if (!alive) return;
        setMode('hold');
        return;
      }

      if (mode === 'hold') {
        await sleep(1100);
        if (!alive) return;
        setMode('erase');
        return;
      }

      // erase
      for (let k = target.length; k >= 0; k--) {
        if (!alive) return;
        setText(target.slice(0, k));
        await sleep(10 + Math.floor(Math.random() * 18));
      }
      if (!alive) return;
      setI((prev) => (prev + 1) % examples.length);
      setMode('type');
    }

    loop();
    return () => {
      alive = false;
    };
  }, [examples, i, mode]);

  return (
    <div className="typewriter" aria-label="Esempi">
      <span className="typewriter-text">{text}</span>
      <span className="typewriter-caret" aria-hidden="true" />
    </div>
  );
}

