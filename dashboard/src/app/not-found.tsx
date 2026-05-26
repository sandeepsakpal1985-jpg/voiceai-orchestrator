import Link from "next/link";
import { PhoneCall, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "404 - Page Not Found | VoiceAI",
  description: "The page you're looking for doesn't exist.",
};

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6">
      <div className="text-center max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600">
            <PhoneCall className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">VoiceAI</span>
        </div>

        <div className="mb-6">
          <p className="text-7xl font-bold text-indigo-600 dark:text-indigo-400 mb-2">404</p>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
            Page not found
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
            Check the URL or head back to the dashboard.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Link href="/dashboard">
            <Button className="gap-2">
              <Home className="h-4 w-4" />
              Go to Dashboard
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="outline" className="gap-2">
              Sign In
            </Button>
          </Link>
        </div>

        <p className="mt-8 text-xs text-zinc-400">
          © 2026 VoiceAI. All rights reserved.
        </p>
      </div>
    </div>
  );
}
