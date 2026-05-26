"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "rgb(39 39 42)",
              color: "rgb(244 244 245)",
              border: "1px solid rgb(63 63 70)",
              borderRadius: "12px",
            },
          }}
        />
      </ThemeProvider>
    </SessionProvider>
  );
}
