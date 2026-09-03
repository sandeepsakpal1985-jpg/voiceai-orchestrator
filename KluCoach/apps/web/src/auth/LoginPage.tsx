import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router-dom";
import { loginSchema } from "@klunex-edu/shared";
import type { z } from "zod";
import { auth, setCsrf } from "../api";
import { FormError } from "../ui/form";

type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "parent@example.test", password: "DemoPassw0rd!" },
  });

  async function onSubmit(values: LoginValues) {
    setError("");
    try {
      const res = await auth.login(values.email, values.password);
      setCsrf(res.csrfToken);
      if (res.user.role === "PARENT") navigate("/parent");
      else if (res.user.role === "STUDENT") navigate("/student");
      else if (res.user.role === "TEACHER") navigate("/attendance");
      else if (res.user.role === "SUPER_ADMIN") navigate("/commercial");
      else navigate("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="brand">
          Klu<span>Coach</span>
        </div>
        <p className="lede">Student 360 for coaching institutes. Parents see the journey in one place.</p>
        {error ? <div className="err">{error}</div> : null}
        <label htmlFor="email">Email</label>
        <input id="email" autoComplete="username" {...form.register("email")} />
        <FormError>{form.formState.errors.email?.message}</FormError>
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" {...form.register("password")} />
        <FormError>{form.formState.errors.password?.message}</FormError>
        <button className="btn" type="submit">
          Continue
        </button>
        <p>
          <Link to="/forgot-password">Forgot password?</Link>
        </p>
        {import.meta.env.DEV ? (
          <p className="hint">Demo: parent@example.test / admin@example.test / teacher@example.test — password DemoPassw0rd!</p>
        ) : null}
      </form>
    </div>
  );
}
