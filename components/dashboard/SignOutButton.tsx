'use client';

import { useTransition } from 'react';
import { LogOut } from 'lucide-react';

export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="btn btn-muted w-full"
      onClick={() => {
        startTransition(async () => {
          await fetch('/api/auth/logout', { method: 'POST' });
          window.location.href = '/login';
        });
      }}
      disabled={pending}
    >
      <LogOut className="h-4 w-4" />
      {pending ? 'Uscita in corso...' : 'Esci'}
    </button>
  );
}
