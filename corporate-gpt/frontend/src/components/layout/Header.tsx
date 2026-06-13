"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const pageTitles: Record<string, string> = {
  "/chat": "AI Assistant",
  "/search": "Knowledge Search",
  "/documents": "Document Management",
  "/analytics": "Analytics Dashboard",
  "/knowledge-health": "Knowledge Health",
  "/faq": "Frequently Asked Questions",
  "/bookmarks": "Bookmarks",
  "/integrations": "Integrations",
  "/admin": "Admin Panel",
  "/settings": "Settings",
};

export function Header() {
  const pathname = usePathname();
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    // Check localStorage or system preference on mount
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      setDarkMode(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  const title = Object.entries(pageTitles).find(([path]) =>
    pathname?.startsWith(path)
  )?.[1] || "CorporateGPT";

  return (
    <header className="border-b bg-card px-6 py-3 flex items-center justify-between">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">Enterprise Knowledge Platform</p>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={toggleDarkMode} title={darkMode ? "Light mode" : "Dark mode"}>
          {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
        <Button variant="ghost" size="icon">
          <Bell className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2 ml-2">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-sm font-medium text-primary">U</span>
          </div>
        </div>
      </div>
    </header>
  );
}
