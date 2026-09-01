import * as React from "react";
import { cn } from "../lib/cn";

export function FormField({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <p className="err">{error}</p> : null}
    </div>
  );
}

export function FormActions({ children }: { children: React.ReactNode }) {
  return <div className={cn("flex gap-2")}>{children}</div>;
}

export function FormError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <div className="err">{children}</div>;
}
