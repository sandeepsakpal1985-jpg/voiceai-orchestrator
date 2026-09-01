import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { Student360 } from "@klunex-edu/shared";
import { api } from "../api";
import { Student360Loading, Student360View } from "../student360/Student360View";

type Guardian = {
  relationship: string;
  isPrimary: boolean;
  guardian: { id: string; name: string; email: string | null; userId: string | null };
};

type Student = {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  status: string;
  preferredName?: string | null;
  branch?: { name: string };
  enrollments: { batch: { id: string; name: string } }[];
  guardians: Guardian[];
};

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<Student | null>(null);
  const [error, setError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [guardianId, setGuardianId] = useState("");
  const [acceptUrl, setAcceptUrl] = useState("");
  const [inviteMsg, setInviteMsg] = useState("");
  const snapshot = useQuery({
    queryKey: ["student360", id],
    enabled: Boolean(id),
    queryFn: () => api<Student360>(`/students/${id}/360`),
  });

  useEffect(() => {
    if (!id) return;
    setError("");
    api<Student>(`/students/${id}`)
      .then((row) => {
        setStudent(row);
        const primary = row.guardians.find((g) => g.isPrimary) ?? row.guardians[0];
        if (primary) {
          setGuardianId(primary.guardian.id);
          setInviteEmail(primary.guardian.email ?? "");
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load student"));
  }, [id]);

  async function invite(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setInviteMsg("");
    setAcceptUrl("");
    try {
      const res = await api<{ acceptUrl: string }>("/invitations", {
        method: "POST",
        body: JSON.stringify({
          type: "PARENT",
          email: inviteEmail,
          studentId: id,
          guardianId: guardianId || undefined,
        }),
      });
      setAcceptUrl(res.acceptUrl);
      setInviteMsg("Invitation created. Share the activation link with the parent.");
    } catch (err) {
      setInviteMsg(err instanceof Error ? err.message : "Could not create invitation");
    }
  }

  if (error) return <p className="err">{error}</p>;
  if (!student) return <p className="hint">Loading student…</p>;

  return (
    <div>
      <div className="top">
        <div>
          <p className="hint">
            <Link to="/students">Students</Link> · Student 360
          </p>
          <h1>
            {student.firstName} {student.lastName}
          </h1>
          <p className="hint">
            {student.admissionNumber} · {student.branch?.name ?? "—"} · {student.enrollments[0]?.batch.name ?? "No batch"} · {student.status}
          </p>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="label">Guardians</div>
        {student.guardians.map((g) => (
          <div className="row" key={g.guardian.id}>
            <span>
              {g.guardian.name} · {g.relationship}
            </span>
            <span className="hint">{g.guardian.userId ? "Activated" : "Not activated"}</span>
          </div>
        ))}
        {student.guardians.length === 0 ? <p className="hint">No guardians linked yet.</p> : null}
        <form onSubmit={invite} style={{ marginTop: 16 }}>
          <div className="label">Parent invitation</div>
          <label htmlFor="invite-guardian">Guardian</label>
          <select id="invite-guardian" value={guardianId} onChange={(e) => setGuardianId(e.target.value)}>
            <option value="">Create with invitation</option>
            {student.guardians.map((g) => (
              <option key={g.guardian.id} value={g.guardian.id}>
                {g.guardian.name}
              </option>
            ))}
          </select>
          <label htmlFor="invite-email">Invitation email</label>
          <input id="invite-email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
          <button className="btn" type="submit">
            Create invitation
          </button>
          {inviteMsg ? <p className="hint">{inviteMsg}</p> : null}
          {acceptUrl ? (
            <p>
              <label htmlFor="invite-accept-url">Activation link</label>
              <input id="invite-accept-url" data-testid="invite-accept-url" readOnly value={acceptUrl} />
            </p>
          ) : null}
        </form>
      </div>
      {snapshot.isError ? (
        <p className="err">{snapshot.error instanceof Error ? snapshot.error.message : "Could not load Student 360"}</p>
      ) : snapshot.data ? (
        <Student360View snapshot={snapshot.data} embedded />
      ) : (
        <Student360Loading />
      )}
    </div>
  );
}
