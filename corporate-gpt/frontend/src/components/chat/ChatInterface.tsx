"use client"
import { useState, useRef, useEffect } from "react"
import { Send } from "lucide-react"
import { ChatMessage } from "./ChatMessage"
import { useChat } from "@/hooks/useChat"

export function ChatInterface({ chatId }: { chatId: string }) {
  const { messages, sendMessage, loading } = useChat(chatId)
  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return
    await sendMessage(input)
    setInput("")
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}
        {loading && <div className="text-gray-400 animate-pulse">Thinking...</div>}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSubmit} className="p-4 border-t flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question..."
          className="flex-1 input-field" disabled={loading} />
        <button type="submit" disabled={loading || !input.trim()}
          className="bg-primary-600 text-white p-2.5 rounded-lg hover:bg-primary-700 disabled:opacity-50">
          <Send className="w-5 h-5" />
        </button>
      </form>
    </>
  )
}
