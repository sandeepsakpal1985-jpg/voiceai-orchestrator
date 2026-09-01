export function ParentChildSwitcher({
  childList,
  selectedId,
  onSelect,
}: {
  childList: { id: string; firstName: string }[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="child-pills">
      {childList.map((c) => (
        <button
          key={c.id}
          type="button"
          className={c.id === selectedId ? "pill on" : "pill"}
          onClick={() => onSelect(c.id)}
        >
          {c.firstName}
        </button>
      ))}
    </div>
  );
}
