import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: {
    default: "Sign In | VoiceAI",
    template: "%s | VoiceAI",
  },
  description: "Sign in to your VoiceAI account to manage your AI voice agent platform.",
};

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
