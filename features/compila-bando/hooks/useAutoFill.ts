'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export function useAutoFill() {
  const [fillingFields, setFillingFields] = useState<Record<string, string>>({});
  const [completedFields, setCompletedFields] = useState<Set<string>>(new Set());
  const [isRunning, setIsRunning] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const timersRef = useRef<NodeJS.Timeout[]>([]);

  const cleanup = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const startAutoFill = useCallback(
    (fieldValues: Record<string, string>, onDone?: () => void) => {
      cleanup();
      setIsRunning(true);
      setAllDone(false);
      setCompletedFields(new Set());
      setFillingFields({});

      const entries = Object.entries(fieldValues);
      let globalDelay = 0;

      entries.forEach(([key, value], fieldIndex) => {
        // Start typing this field after previous fields have had some time
        const fieldStartDelay = fieldIndex * 900;
        globalDelay = Math.max(globalDelay, fieldStartDelay + value.length * 30);

        // Type each character one by one
        for (let charIdx = 0; charIdx <= value.length; charIdx++) {
          const timer = setTimeout(() => {
            setFillingFields((prev) => ({
              ...prev,
              [key]: value.slice(0, charIdx),
            }));

            // Mark as completed when fully typed
            if (charIdx === value.length) {
              const markDoneTimer = setTimeout(() => {
                setCompletedFields((prev) => new Set([...prev, key]));
              }, 200);
              timersRef.current.push(markDoneTimer);
            }
          }, fieldStartDelay + charIdx * 30);
          timersRef.current.push(timer);
        }
      });

      // All done
      const doneTimer = setTimeout(() => {
        setIsRunning(false);
        setAllDone(true);
        onDone?.();
      }, globalDelay + 600);
      timersRef.current.push(doneTimer);
    },
    [cleanup]
  );

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return { fillingFields, completedFields, isRunning, allDone, startAutoFill, cleanup };
}
