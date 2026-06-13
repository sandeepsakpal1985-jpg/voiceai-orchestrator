import { cn } from "@/lib/utils"

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return <table className={cn("w-full text-sm", className)}>{children}</table>
}

export function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("text-left p-3 font-medium text-gray-500", className)}>{children}</th>
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("p-3 border-t", className)}>{children}</td>
}
