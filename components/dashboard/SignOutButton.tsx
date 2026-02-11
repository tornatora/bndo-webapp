'use client';

import { useTransition } from 'react';
import { LogOut } from 'lucide-react';

export function SignOutButton({
  className = 'btn btn-muted w-full',
  compact = false
}: {
  className?: string;
  compact?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      className={className}
      onClick={() => {
        startTransition(async () => {
          await fetch('/api/auth/logout', { method: 'POST' });
          window.location.href = '/login';
        });
      }}
      disabled={pending}
    >
      {!compact ? <LogOut className="h-4 w-4" /> : null}
      {pending ? 'Uscita in corso...' : 'Esci'}
    </button>
  );
}
