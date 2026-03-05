'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

type FocusMode = 'desktop' | 'manual';

function isDesktopViewport() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(min-width: 900px)').matches;
}

export function InputArea({
  placeholder,
  disabled,
  onSend,
  onReset,
  focusMode = 'desktop',
  blurSignal = 0,
  onComposerFocusChange
}: {
  placeholder: string;
  disabled?: boolean;
  onSend: (text: string) => void | Promise<void>;
  onReset?: () => void;
  focusMode?: FocusMode;
  blurSignal?: number;
  onComposerFocusChange?: (focused: boolean) => void;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (disabled || focusMode === 'manual') return;
    if (!isDesktopViewport()) return;
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [disabled, placeholder, focusMode]);

  useEffect(() => {
    if (!blurSignal) return;
    inputRef.current?.blur();
  }, [blurSignal]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setValue('');
    await onSend(trimmed);
    if (focusMode === 'manual' || !isDesktopViewport()) {
      inputRef.current?.blur();
      return;
    }
    inputRef.current?.focus();
  }

  return (
    <form className="composer" onSubmit={onSubmit}>
      <input
        ref={inputRef}
        className="composer-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={600}
        disabled={disabled}
        onFocus={() => onComposerFocusChange?.(true)}
        onBlur={() => onComposerFocusChange?.(false)}
      />
      <button type="submit" className="composer-send" disabled={disabled}>
        ↑
      </button>
    </form>
  );
}
