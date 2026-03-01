interface Props {
  value: number;
}

export function ProgressBarPro({ value }: Props) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-bgSubtle">
      <div
        className="h-full rounded-full bg-green-gradient transition-all"
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}
