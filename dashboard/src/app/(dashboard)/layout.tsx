import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import Sidebar from "@/components/dashboard/sidebar";

export const metadata: Metadata = {
  title: {
    default: "Dashboard | VoiceAI",
    template: "%s | VoiceAI",
  },
  description: "Enterprise AI voice agent platform — manage calls, campaigns, analytics, and voice settings.",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 pl-64">
        <main id="main-content" className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
          {children}
        </main>
      </div>
    </div>
  );
}
