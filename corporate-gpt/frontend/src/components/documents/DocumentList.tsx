"use client"
import { FileText, Trash2 } from "lucide-react"
import { formatDate } from "@/lib/utils"

export function DocumentList({ docs, onDelete }: { docs: any[]; onDelete: () => void }) {
  async function handleDelete(id: string) {
    await fetch(`/api/v1/documents/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } })
    onDelete()
  }

  return (
    <div className="bg-white rounded-xl border">
      <div className="p-4 border-b">
        <h2 className="font-semibold">Documents ({docs.length})</h2>
      </div>
      <div className="divide-y">
        {docs.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between p-4 hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-gray-400" />
              <div>
                <p className="font-medium text-sm">{doc.original_filename}</p>
                <p className="text-xs text-gray-500">
                  {doc.file_type?.toUpperCase()} &middot; {formatDate(doc.created_at)}
                  {doc.is_indexed && <span className="text-green-600 ml-2">Indexed</span>}
                </p>
              </div>
            </div>
            <button onClick={() => handleDelete(doc.id)} className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {docs.length === 0 && <p className="text-gray-400 text-center p-8">No documents uploaded yet.</p>}
      </div>
    </div>
  )
}
