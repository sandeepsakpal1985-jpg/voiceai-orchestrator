import { FormEvent, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

type Citation = { type: string; label: string; value: string };
type AskResponse = {
  available: boolean;
  answer: string;
  citations: Citation[];
  contextVersion: string | null;
  provider: string;
};
type Status = { enabled: boolean; provider: string };

export function AiAskPanel({
  title,
  endpoint,
  prompts,
}: {
  title: string;
  endpoint: string;
  prompts: string[];
}) {
  const status = useQuery({
    queryKey: ["ai", "status"],
    queryFn: () => api<Status>("/ai/status"),
  });
  const [message, setMessage] = useState(prompts[0] ?? "");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setResult(null);
    setError("");
    setMessage(prompts[0] ?? "");
  }, [endpoint]);

  async function ask(text: string) {
    setError("");
    setBusy(true);
    try {
      const res = await api<AskResponse>(endpoint, {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI assistance is temporarily unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await ask(message);
  }

  if (status.isLoading || status.isError) return null;
  if (!status.data?.enabled) {
    return (
      <section className="card ai-panel" data-testid="ai-panel">
        <h2>{title}</h2>
        <p className="hint" data-testid="ai-disabled">
          AI assistance is not enabled for this environment.
        </p>
      </section>
    );
  }

  return (
    <section className="card ai-panel" data-testid="ai-panel">
      <h2>{title}</h2>
      <div className="ai-prompts">
        {prompts.map((p) => (
          <button
            key={p}
            type="button"
            className="btn secondary"
            onClick={() => {
              setMessage(p);
              void ask(p);
            }}
          >
            {p}
          </button>
        ))}
      </div>
      <form onSubmit={onSubmit}>
        <label htmlFor={`ai-q-${title}`}>Ask KluCoach</label>
        <input
          id={`ai-q-${title}`}
          data-testid="ai-question"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
        />
        <button className="btn" type="submit" disabled={busy} data-testid="ai-ask">
          {busy ? "Asking…" : "Ask"}
        </button>
      </form>
      {error ? <p className="err">{error}</p> : null}
      {result ? (
        <div className="ai-answer" data-testid="ai-answer">
          <p>{result.answer}</p>
          {result.citations.length ? (
            <ul data-testid="ai-citations">
              {result.citations.map((c) => (
                <li key={`${c.type}-${c.label}`}>
                  {c.label}: {c.value}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
