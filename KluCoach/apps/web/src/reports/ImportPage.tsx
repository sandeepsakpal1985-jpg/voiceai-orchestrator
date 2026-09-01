import { FormEvent, useState } from "react";
import { api } from "../api";

export function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ jobId: string; total: number; valid: number; errors: { rowNumber: number; message: string }[] } | null>(null);
  const [result, setResult] = useState("");

  async function previewCsv(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    const csrf = document.cookie.match(/(?:^|; )klucoach\.csrf=([^;]*)/)?.[1];
    const res = await fetch("/api/imports/students/preview", {
      method: "POST",
      body,
      credentials: "include",
      headers: csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {},
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? "Preview failed");
    setPreview(data);
  }

  async function commit() {
    if (!preview) return;
    const data = await api<{ created: number }>(`/imports/students/${preview.jobId}/commit`, { method: "POST" });
    setResult(`Imported ${data.created} students`);
  }

  return (
    <div>
      <div className="top">
        <h1>Bulk import</h1>
      </div>
      <form className="card" onSubmit={previewCsv}>
        <p className="hint">CSV or XLSX columns: firstName, lastName, admissionNumber, branchName, batchName, parentName, parentPhone, parentEmail, email, phone. Invalid rows are listed — nothing is imported silently.</p>
        <input
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button className="btn" type="submit">Preview</button>
      </form>
      {preview && (
        <div className="card" style={{ marginTop: 16 }}>
          <p>
            {preview.valid} valid of {preview.total}. {preview.errors.length} errors.
          </p>
          {preview.errors.map((e) => (
            <div className="row" key={`${e.rowNumber}-${e.message}`}>
              Row {e.rowNumber}: {e.message}
            </div>
          ))}
          <button className="btn" type="button" onClick={commit} disabled={!preview.valid}>
            Confirm import
          </button>
          {result && <p className="hint">{result}</p>}
        </div>
      )}
    </div>
  );
}
