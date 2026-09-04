import { useQuery } from "@tanstack/react-query";
import type { Student360 } from "@klunex-edu/shared";
import { api } from "../api";
import { Student360Loading, Student360View } from "../student360/Student360View";
import { RecentNotifications } from "../notifications/NotificationCenter";
import { AiAskPanel } from "../ai/AiAskPanel";

export function StudentDashboard() {
  const query = useQuery({
    queryKey: ["student360", "self"],
    queryFn: () => api<Student360>("/dashboard/student"),
  });
  if (query.isError) {
    return <p className="err">{query.error instanceof Error ? query.error.message : "Could not load Student 360"}</p>;
  }
  if (!query.data) return <Student360Loading />;
  return (
    <div>
      <RecentNotifications />
      <Student360View snapshot={query.data} />
      <AiAskPanel
        title="Ask about my progress"
        endpoint={`/ai/students/${query.data.student.id}/ask`}
        prompts={["How am I doing?", "What should I improve?", "How are my recent results?", "What assignments are pending?"]}
      />
    </div>
  );
}
