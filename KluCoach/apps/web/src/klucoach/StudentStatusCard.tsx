export function StudentStatusCard({
  label,
  value,
  hint,
  compact,
}: {
  label: string;
  value: string;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value" style={compact ? { fontSize: "1.1rem" } : undefined}>
        {value}
      </div>
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}
