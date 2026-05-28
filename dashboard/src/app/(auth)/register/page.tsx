"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PhoneCall, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    companyName: "",
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const nameRegex = /^.{2,}$/;

  const getStrength = (pw: string): { score: number; label: string; color: string } => {
    let score = 0;
    if (pw.length >= 8) score += 1;
    if (pw.length >= 12) score += 1;
    if (/[A-Z]/.test(pw)) score += 1;
    if (/[a-z]/.test(pw)) score += 1;
    if (/[0-9]/.test(pw)) score += 1;
    if (/[^A-Za-z0-9]/.test(pw)) score += 1;

    if (score <= 2) return { score, label: "Weak", color: "bg-red-500" };
    if (score <= 4) return { score, label: "Medium", color: "bg-amber-500" };
    return { score, label: "Strong", color: "bg-emerald-500" };
  };

  const strength = getStrength(form.password);
  const passwordsMatch = form.password === form.confirmPassword;
  const emailValid = emailRegex.test(form.email);
  const nameValid = nameRegex.test(form.name);
  const canSubmit = nameValid && emailValid && form.password.length >= 8 && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true, confirmPassword: true });

    if (!canSubmit) {
      if (!nameValid) toast.error("Please enter your full name");
      else if (!emailValid) toast.error("Please enter a valid email address");
      else if (form.password.length < 8) toast.error("Password must be at least 8 characters");
      else if (!passwordsMatch) toast.error("Passwords do not match");
      return;
    }

    setIsLoading(true);

    try {
      const { confirmPassword, ...payload } = form;
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Registration failed");
      } else {
        toast.success("Account created! Please check your email to verify.");
        router.push("/login?pendingVerification=true");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

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
            Deploy intelligent voice agents at scale with enterprise-grade infrastructure
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
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Create an account</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Get started with your free trial
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                placeholder="John Doe"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                placeholder="Acme Inc."
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Work Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  value={form.password}
                  onChange={(e) => {
                    setForm({ ...form, password: e.target.value });
                    setTouched({ ...touched, password: true });
                  }}
                  onBlur={() => setTouched({ ...touched, password: true })}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={touched.password && form.password.length > 0 && form.password.length < 8 ? "border-red-500 focus-visible:ring-red-500" : ""}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Password strength indicator */}
              {form.password.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                          i <= strength.score ? strength.color : "bg-zinc-200 dark:bg-zinc-700"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className={`text-xs font-medium ${
                      strength.score <= 2 ? "text-red-500" : strength.score <= 4 ? "text-amber-500" : "text-emerald-500"
                    }`}>
                      {strength.label}
                    </p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                      {form.password.length} / 8 min
                    </p>
                  </div>
                </div>
              )}
              {touched.password && form.password.length > 0 && form.password.length < 8 && (
                <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                  <XCircle className="h-3 w-3" />
                  Minimum 8 characters required
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="Re-enter your password"
                  value={form.confirmPassword}
                  onChange={(e) => {
                    setForm({ ...form, confirmPassword: e.target.value });
                    setTouched({ ...touched, confirmPassword: true });
                  }}
                  onBlur={() => setTouched({ ...touched, confirmPassword: true })}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={touched.confirmPassword && form.confirmPassword.length > 0 && !passwordsMatch ? "border-red-500 focus-visible:ring-red-500" : touched.confirmPassword && passwordsMatch && form.confirmPassword.length > 0 ? "border-emerald-500 focus-visible:ring-emerald-500" : ""}
                />
              </div>
              {touched.confirmPassword && form.confirmPassword.length > 0 && (
                <p className={`text-xs flex items-center gap-1 mt-1 ${passwordsMatch ? "text-emerald-500" : "text-red-500"}`}>
                  {passwordsMatch ? (
                    <><CheckCircle2 className="h-3 w-3" /> Passwords match</>
                  ) : (
                    <><XCircle className="h-3 w-3" /> Passwords do not match</>
                  )}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full h-11" disabled={isLoading}>
              {isLoading ? "Creating account..." : "Create account"}
            </Button>
          </form>

          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Sign in
            </Link>
          </p>

          <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center">
            By creating an account, you agree to our{" "}
            <Link href="#" className="underline hover:text-zinc-600 dark:hover:text-zinc-300">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="#" className="underline hover:text-zinc-600 dark:hover:text-zinc-300">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
