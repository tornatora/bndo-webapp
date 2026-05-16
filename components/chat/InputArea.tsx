'use client';

import { FormEvent, useEffect, useRef, useState, memo, useCallback } from 'react';

type FocusMode = 'desktop' | 'manual';
type VoiceState = 'idle' | 'connecting' | 'connected' | 'recording' | 'responding' | 'playing';

function isDesktopViewport() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(min-width: 900px)').matches;
}

export const InputArea = memo(function InputArea({
  placeholder,
  disabled,
  onSend,
  onReset,
  focusMode = 'desktop',
  blurSignal = 0,
  onComposerFocusChange,
  onVoiceStart,
  onVoiceEnd,
  voiceState,
  voiceAvailable,
}: {
  placeholder: string;
  disabled?: boolean;
  onSend: (text: string) => void | Promise<void>;
  onReset?: () => void;
  focusMode?: FocusMode;
  blurSignal?: number;
  onComposerFocusChange?: (focused: boolean) => void;
  onVoiceStart?: () => void;
  onVoiceEnd?: () => void;
  voiceState?: VoiceState;
  voiceAvailable?: boolean;
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

  const isRecording = voiceState === 'recording';

  const handleVoiceMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    onVoiceStart?.();
  }, [onVoiceStart]);

  const handleVoiceMouseUp = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    onVoiceEnd?.();
  }, [onVoiceEnd]);

  // Glow pulse animation style for recording state
  const micBtnStyle: React.CSSProperties = isRecording
    ? {
        background: '#ef4444',
        color: '#fff',
        boxShadow: '0 0 0 0 rgba(239,68,68,0.6)',
        animation: 'voice-pulse 1.2s ease-in-out infinite',
      }
    : {};

  return (
    <form className="composer" onSubmit={onSubmit}>
      <input
        ref={inputRef}
        className="composer-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={600}
        disabled={disabled || isRecording}
        onFocus={() => onComposerFocusChange?.(true)}
        onBlur={() => onComposerFocusChange?.(false)}
      />
      {/* Microfono rimosso */}
      <button type="submit" className="composer-send" disabled={disabled || isRecording}>
        ↑
      </button>
    </form>
  );
});
