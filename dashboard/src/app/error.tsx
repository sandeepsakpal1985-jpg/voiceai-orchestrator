"use client";

import { useEffect } from "react";
import Link from "next/link";
import { PhoneCall, AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Unhandled application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6">
      <div className="text-center max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600">
            <PhoneCall className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">VoiceAI</span>
        </div>

        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20 mx-auto mb-4">
          <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
        </div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
          Something went wrong
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mb-6">
          An unexpected error occurred. Our team has been notified. Please try again or return to the dashboard.
        </p>

        <div className="flex items-center justify-center gap-3">
          <Button onClick={reset} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
          <Link href="/dashboard">
            <Button variant="outline" className="gap-2">
              <Home className="h-4 w-4" />
              Dashboard
            </Button>
          </Link>
        </div>

        {error.digest && (
          <p className="mt-6 text-xs text-zinc-400">
            Error ID: {error.digest}
          </p>
        )}

        <p className="mt-8 text-xs text-zinc-400">
          © 2026 VoiceAI. All rights reserved.
        </p>
      </div>
    </div>
  );
}
