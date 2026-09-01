import * as React from "react";
import { cn } from "../lib/cn";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "mb-3.5 w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-3",
        className,
      )}
      {...props}
    />
  );
}
