"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  PhoneCall,
  BarChart3,
  Radio,
  History,
  FileText,
  BookOpen,
  Users,
  Settings,
  CreditCard,
  Mic2,
  MicVocal,
  Globe,
  Megaphone,
  Headphones,
  Activity,
  MessageSquare,
  ChevronLeft,
  Bot,
  Cpu,
  Building2,
  Brain,
} from "lucide-react";
import { useState } from "react";

const navigation = [
  {
    title: "Overview",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "Voice Chat", href: "/dashboard/voice-chat", icon: PhoneCall },
    ],
  },
  {
    title: "Communications",
    items: [
      { title: "AI Agent", href: "/dashboard/ai-agent", icon: Bot },
      { title: "Call Analytics", href: "/dashboard/analytics", icon: BarChart3 },
      { title: "Live Monitoring", href: "/dashboard/live-monitoring", icon: Radio },
      { title: "Realtime Dashboard", href: "/dashboard/realtime-dashboard", icon: Activity },
      { title: "Call History", href: "/dashboard/call-history", icon: History },
      { title: "Call Recordings", href: "/dashboard/recordings", icon: Headphones },
    ],
  },
  {
    title: "AI & Content",
    items: [
      { title: "AI Agents", href: "/dashboard/agents", icon: Bot },
      { title: "Prompt Editor", href: "/dashboard/prompts", icon: FileText },
      { title: "Knowledge Base", href: "/dashboard/knowledge-base", icon: BookOpen },
      { title: "Voice Selection", href: "/dashboard/voices", icon: Mic2 },
      { title: "Voice Cloning", href: "/dashboard/voice-cloning", icon: MicVocal },
      { title: "Multilingual", href: "/dashboard/multilingual", icon: Globe },
    ],
  },
  {
    title: "Connections",
    items: [
      { title: "CRM", href: "/dashboard/crm", icon: Users },
      { title: "Social Automation", href: "/dashboard/social", icon: Globe },
    ],
  },
  {
    title: "Operations",
    items: [
      { title: "Campaigns", href: "/dashboard/campaigns", icon: Megaphone },
      { title: "Sentiment", href: "/dashboard/sentiment", icon: MessageSquare },
      { title: "Monitoring", href: "/dashboard/monitoring", icon: Cpu },
    ],
  },
  {
    title: "Account",
    items: [
      { title: "Subscription", href: "/dashboard/subscriptions", icon: CreditCard },
      { title: "Billing", href: "/dashboard/billing", icon: CreditCard },
      { title: "Settings", href: "/dashboard/settings", icon: Settings },
      { title: "Organization", href: "/dashboard/organization-settings", icon: Building2 },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 transition-all duration-300",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-zinc-200 dark:border-zinc-800">
        <Link href="/dashboard" className="flex items-center gap-3" aria-label="Go to dashboard">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600">
            <PhoneCall className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              VoiceAI
            </span>
          )}
        </Link>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 transition-transform",
              collapsed && "rotate-180"
            )}
          />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6" aria-label="Sidebar navigation">
        {navigation.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <h4 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {section.title}
              </h4>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300"
                          : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-100",
                        collapsed && "justify-center px-2"
                      )}
                      title={collapsed ? item.title : undefined}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 p-3">
        {!collapsed && (
          <div className="flex items-center gap-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              All systems operational
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
