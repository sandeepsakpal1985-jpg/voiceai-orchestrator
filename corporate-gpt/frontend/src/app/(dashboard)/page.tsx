"use client"
import { useEffect, useState } from "react"
import { BarChart3, FileText, MessageSquare, Users, TrendingUp, ThumbsUp } from "lucide-react"
import { Card } from "../components/ui/card"

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/v1/analytics/dashboard", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } })
      .then((r) => r.json()).then(setStats).finally(() => setLoading(false))
  }, [])

  const cards = stats ? [
    { label: "Questions", value: stats.questions_total, icon: MessageSquare, color: "text-blue-600" },
    { label: "Active Users", value: stats.active_users, icon: Users, color: "text-green-600" },
    { label: "Documents", value: stats.total_documents, icon: FileText, color: "text-purple-600" },
    { label: "Thumbs Up", value: stats.thumbs_up, icon: ThumbsUp, color: "text-amber-600" },
  ] : []

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {loading ? [...Array(4)].map((_, i) => (
          <div key={i} className="card animate-pulse"><div className="h-16 bg-gray-200 rounded" /></div>
        )) : cards.map((c) => (
          <Card key={c.label}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{c.label}</p>
                <p className="text-2xl font-bold mt-1">{c.value}</p>
              </div>
              <c.icon className={`w-10 h-10 ${c.color} opacity-80`} />
            </div>
          </Card>
        ))}
      </div>
      <div className="card">
        <h2 className="font-semibold mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <a href="/chat" className="btn-primary">Ask a Question</a>
          <a href="/documents" className="border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50">Upload Documents</a>
        </div>
      </div>
    </div>
  )
}
