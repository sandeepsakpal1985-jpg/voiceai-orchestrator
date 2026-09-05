import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export type StudentInsightItem = {
  id: string;
  studentId: string;
  type: string;
  severity: string;
  title: string;
  summary: string;
  detectedAt: string;
};

export function RecentInsights({
  studentId,
  href,
}: {
  studentId: string;
  href: string;
}) {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["insights", studentId],
    queryFn: () => api<{ items: StudentInsightItem[] }>(`/students/${studentId}/insights`),
  });
  if (!query.data?.items.length) return null;
  return (
    <section className="card" style={{ marginBottom: 16 }} data-testid="student-insights" aria-labelledby="recent-insights-heading">
      <h2 id="recent-insights-heading" className="label">
        Recent insights
      </h2>
      <p className="hint">Factual updates from KluCoach records. Not a risk score or diagnosis.</p>
      {query.data.items.map((row) => (
        <button
          type="button"
          className="row notify-row"
          key={row.id}
          data-testid={`insight-${row.type}`}
          onClick={() => navigate(href)}
        >
          <span>{row.summary}</span>
        </button>
      ))}
    </section>
  );
}
