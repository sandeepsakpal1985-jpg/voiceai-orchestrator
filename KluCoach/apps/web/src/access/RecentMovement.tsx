import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

type MovementItem = {
  id: string;
  type: string;
  gateName: string;
  institutionName: string;
  occurredAt: string;
  outsideSchedule: boolean;
};

export function RecentMovement({ studentId }: { studentId: string }) {
  const query = useQuery({
    queryKey: ["movement", studentId],
    queryFn: () => api<{ items: MovementItem[] }>(`/students/${studentId}/movement`),
    retry: false,
  });
  if (query.isError || !query.data?.items.length) return null;
  return (
    <section className="card" style={{ marginBottom: 16 }} data-testid="student-movement">
      <h2 className="label">At the institute</h2>
      <p className="hint">Entry and exit from the institute gate. Not live GPS.</p>
      {query.data.items.slice(0, 8).map((row) => (
        <div className="row" key={row.id} data-testid={`movement-${row.type}`}>
          <span>
            {row.type === "ENTRY" ? "Entered" : "Left"} {row.gateName}
          </span>
          <span className="hint">{format(new Date(row.occurredAt), "h:mm a")}</span>
        </div>
      ))}
    </section>
  );
}
