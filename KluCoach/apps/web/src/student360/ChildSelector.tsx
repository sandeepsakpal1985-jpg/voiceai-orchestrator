export function ChildSelector({
  childList,
  selectedId,
  onSelect,
}: {
  childList: { id: string; firstName: string; lastName: string }[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  if (childList.length < 2) return null;
  return (
    <div className="child-pills" role="group" aria-label="Select child">
      {childList.map((c) => (
        <button
          key={c.id}
          type="button"
          className={c.id === selectedId ? "pill on" : "pill"}
          aria-pressed={c.id === selectedId}
          aria-label={`${c.firstName} ${c.lastName}`}
          onClick={() => onSelect(c.id)}
        >
          {c.firstName} {c.lastName}
        </button>
      ))}
    </div>
  );
}
