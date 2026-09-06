import { FormEvent, useState } from "react";
import { api } from "../api";

type Preview = {
  jobId: string;
  total: number;
  valid: number;
  errorCount: number;
  errors: { rowNumber: number; message: string }[];
  errorTruncated?: boolean;
  partialImport?: boolean;
  partialImportNote?: string;
};

export function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
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
        <p className="hint">
          CSV or XLSX columns: firstName, lastName, admissionNumber, branchName, batchName, parentName, parentPhone,
          parentEmail, email, phone. Invalid rows are listed and skipped. Only valid rows are committed — a malformed
          row does not change other rows. Maximum 2,000 rows per file. Valid rows stay on the server until you confirm;
          they are not loaded into the browser.
        </p>
        <input
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button className="btn" type="submit">Preview</button>
      </form>
      {preview && (
        <div className="card" style={{ marginTop: 16 }}>
          <p data-testid="import-preview-summary">
            {preview.valid} valid of {preview.total}. {preview.errorCount} errors.
          </p>
          {preview.partialImport ? (
            <p className="hint" data-testid="import-partial-note">
              {preview.partialImportNote ?? "Only valid rows are committed. Invalid rows are skipped and listed."}
            </p>
          ) : null}
          {preview.errorTruncated ? (
            <p className="hint">Showing the first {preview.errors.length} errors of {preview.errorCount}.</p>
          ) : null}
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
