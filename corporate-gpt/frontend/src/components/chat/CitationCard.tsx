export function CitationCard({ citation }: { citation: any }) {
  return (
    <div className="bg-white/80 rounded-lg p-2 text-xs">
      <p className="font-medium text-gray-700">{citation.document_name}</p>
      <p className="text-gray-500 mt-0.5">&ldquo;{citation.snippet}&rdquo;</p>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-gray-400">Score: {Math.round(citation.confidence_score * 100)}%</span>
      </div>
    </div>
  )
}
