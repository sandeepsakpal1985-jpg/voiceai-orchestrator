"use client";

import { useState } from "react";
import Link from "next/link";
import { PhoneCall, ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to send reset email");
      } else {
        setSent(true);
        toast.success("Reset link sent if account exists");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex">
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:40px_40px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                <PhoneCall className="h-7 w-7 text-white" />
              </div>
              <span className="text-3xl font-bold text-white">VoiceAI</span>
            </div>
            <p className="text-lg text-indigo-200 max-w-md">
              Enterprise AI voice agent platform for intelligent call automation
            </p>
          </div>
          <div className="absolute bottom-8 left-8 text-indigo-300 text-sm">
            © 2026 VoiceAI. All rights reserved.
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white dark:bg-zinc-950">
          <div className="w-full max-w-sm text-center space-y-6">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Check your email</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              If an account exists with <strong className="text-zinc-700 dark:text-zinc-300">{email}</strong>,
              we&apos;ve sent a password reset link. It expires in 1 hour.
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Didn&apos;t receive the email? Check your spam folder or{" "}
              <button
                onClick={() => { setSent(false); setIsLoading(false); }}
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
              >
                try again
              </button>
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left - Brand */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:40px_40px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
              <PhoneCall className="h-7 w-7 text-white" />
            </div>
            <span className="text-3xl font-bold text-white">VoiceAI</span>
          </div>
          <p className="text-lg text-indigo-200 max-w-md">
            Enterprise AI voice agent platform for intelligent call automation
          </p>
        </div>
        <div className="absolute bottom-8 left-8 text-indigo-300 text-sm">
          © 2026 VoiceAI. All rights reserved.
        </div>
      </div>

      {/* Right - Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white dark:bg-zinc-950">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center lg:text-left">
            <div className="flex items-center justify-center lg:justify-start gap-2 mb-4 lg:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600">
                <PhoneCall className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-zinc-900 dark:text-zinc-100">VoiceAI</span>
            </div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Forgot password?</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              No worries — enter your email and we&apos;ll send you a reset link
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="pl-10"
                />
              </div>
            </div>

            <Button type="submit" className="w-full h-11" disabled={isLoading}>
              {isLoading ? "Sending reset link..." : "Send reset link"}
            </Button>
          </form>

          <div className="text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
