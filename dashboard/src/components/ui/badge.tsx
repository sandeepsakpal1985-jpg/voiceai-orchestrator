import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200",
        primary: "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300",
        success: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300",
        warning: "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300",
        danger: "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300",
        info: "bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300",
        secondary: "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
        outline: "border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 bg-transparent",
        destructive: "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300",
      },
      size: {
        default: "px-2.5 py-0.5 text-xs",
        sm: "px-2 py-0.25 text-[10px]",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
