import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { Student360 } from "@klunex-edu/shared";
import { api } from "../api";
import { ChildSelector } from "../student360/ChildSelector";
import { Student360Loading, Student360View } from "../student360/Student360View";
import { RecentNotifications } from "../notifications/NotificationCenter";
import { RecentInsights } from "../insights/RecentInsights";
import { AiAskPanel } from "../ai/AiAskPanel";

type ParentHome = {
  children: { id: string; firstName: string; lastName: string }[];
  snapshot: Student360 | null;
};

export function ParentDashboard() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("studentId") ?? undefined;
  const query = useQuery({
    queryKey: ["student360", "parent", requested ?? "default"],
    queryFn: () => api<ParentHome>(`/dashboard/parent${requested ? `?studentId=${requested}` : ""}`),
  });

  if (query.isError) {
    return <p className="err">{query.error instanceof Error ? query.error.message : "Could not load Student 360"}</p>;
  }
  if (query.isLoading || !query.data) return <Student360Loading />;
  if (!query.data.snapshot) return <p className="hint">No children linked yet.</p>;

  return (
    <div>
      <ChildSelector
        childList={query.data.children}
        selectedId={query.data.snapshot.student.id}
        onSelect={(id) => setParams({ studentId: id })}
      />
      <RecentNotifications />
      <RecentInsights
        studentId={query.data.snapshot.student.id}
        href={`/parent?studentId=${query.data.snapshot.student.id}`}
      />
      <Student360View snapshot={query.data.snapshot} />
      <AiAskPanel
        key={query.data.snapshot.student.id}
        title={`Ask about ${query.data.snapshot.student.firstName}`}
        endpoint={`/ai/students/${query.data.snapshot.student.id}/ask`}
        prompts={[
          "How is my child doing?",
          "What needs attention?",
          "How is attendance?",
          "How are recent test results?",
          "What assignments are pending?",
        ]}
      />
    </div>
  );
}
