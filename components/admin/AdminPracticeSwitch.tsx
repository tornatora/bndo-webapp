'use client';

import { useRouter } from 'next/navigation';

export function AdminPracticeSwitch({
  companyId,
  selectedPracticeId,
  practices
}: {
  companyId: string;
  selectedPracticeId: string;
  practices: Array<{ id: string; title: string }>;
}) {
  const router = useRouter();

  return (
    <div className="admin-practice-switch">
      <label className="admin-practice-switch-label" htmlFor="practiceSwitch">
        Pratica
      </label>
      <select
        id="practiceSwitch"
        className="admin-practice-switch-select"
        value={selectedPracticeId}
        onChange={(e) => {
          const id = e.target.value;
          router.push(`/admin/clients/${companyId}?tab=practice:${id}`);
        }}
      >
        {practices.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
    </div>
  );
}

