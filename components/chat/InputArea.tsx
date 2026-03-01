'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

export function InputArea({
  placeholder,
  disabled,
  onSend,
  onReset
}: {
  placeholder: string;
  disabled?: boolean;
  onSend: (text: string) => void | Promise<void>;
  onReset?: () => void;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (disabled) return;
    inputRef.current?.focus();
  }, [disabled, placeholder]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setValue('');
    await onSend(trimmed);
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
        autoFocus
      />
      <button type="submit" className="composer-send" disabled={disabled}>
        ↑
      </button>
    </form>
  );
}
