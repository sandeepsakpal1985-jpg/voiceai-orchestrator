import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const separatorVariants = cva("shrink-0 bg-zinc-200 dark:bg-zinc-800", {
  variants: {
    orientation: {
      horizontal: "h-[1px] w-full",
      vertical: "h-full w-[1px]",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
  },
});

interface SeparatorProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof separatorVariants> {}

function Separator({ className, orientation, ...props }: SeparatorProps) {
  return (
    <div
      className={cn(separatorVariants({ orientation }), className)}
      {...props}
    />
  );
}

export { Separator };
