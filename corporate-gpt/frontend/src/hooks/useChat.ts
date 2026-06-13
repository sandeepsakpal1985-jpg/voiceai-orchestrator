"use client"
import { useState, useCallback } from "react"

export function useChat(chatId: string) {
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const sendMessage = useCallback(async (content: string) => {
    setLoading(true)
    setMessages((prev) => [...prev, { role: "user", content }])
    try {
      const res = await fetch(`/api/v1/chat/${chatId}/messages?content=${encodeURIComponent(content)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      })
      const data = await res.json()
      setMessages((prev) => [...prev, { role: "assistant", content: data.ai_message.content, citations: data.ai_message.citations }])
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Error getting response" }])
    }
    setLoading(false)
  }, [chatId])

  return { messages, sendMessage, loading }
}
