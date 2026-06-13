"use client"
import { Bell, LogOut } from "lucide-react"
import { logout } from "@/lib/auth"

export function Navbar() {
  return (
    <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
      <div />
      <div className="flex items-center gap-4">
        <button className="p-2 hover:bg-gray-100 rounded-lg"><Bell className="w-5 h-5 text-gray-500" /></button>
        <button onClick={logout} className="flex items-center gap-2 text-gray-500 hover:text-red-600 text-sm">
          <LogOut className="w-4 h-4" /> Logout
        </button>
      </div>
    </header>
  )
}
