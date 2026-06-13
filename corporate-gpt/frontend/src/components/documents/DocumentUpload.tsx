"use client"
import { useState, useRef } from "react"
import { Upload } from "lucide-react"

export function DocumentUpload({ onUploaded }: { onUploaded: () => void }) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const form = new FormData()
    form.append("file", file)
    try {
      await fetch("/api/v1/documents/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: form,
      })
      onUploaded()
    } catch (e) {
      console.error("Upload failed", e)
    }
    setUploading(false)
  }

  return (
    <div className="card">
      <h2 className="font-semibold mb-4">Upload Document</h2>
      <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-primary-400 transition-colors cursor-pointer"
           onClick={() => fileRef.current?.click()}>
        <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
        <p className="text-sm text-gray-500">Click to upload</p>
        <p className="text-xs text-gray-400 mt-1">PDF, DOCX, PPTX, XLSX, CSV, TXT, MD, HTML</p>
      </div>
      <input ref={fileRef} type="file" className="hidden" onChange={handleFile} disabled={uploading} />
      {uploading && <p className="text-sm text-primary-600 mt-2 animate-pulse">Processing...</p>}
    </div>
  )
}
