import type { EmailAddress } from "@/lib/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isEmail(value: string): boolean {
  return EMAIL_PATTERN.test(normalizeEmail(value));
}

export function normalizeSubject(value: string): string {
  return value.replace(/^(?:\s*(?:re|fw|fwd)\s*:\s*)+/i, "").trim();
}

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseAddressList(value: string | null | undefined): EmailAddress[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const named = part.match(/^(.*)<([^>]+)>$/);
      if (named) {
        return { name: named[1]?.replace(/"/g, "").trim() || undefined, email: normalizeEmail(named[2] ?? "") };
      }
      return { email: normalizeEmail(part) };
    })
    .filter((item) => isEmail(item.email));
}

export function formatAddress(address: EmailAddress): string {
  if (address.name) return `${address.name} <${address.email}>`;
  return address.email;
}

const BLOCKED_EXTENSIONS = new Set(["exe", "bat", "cmd", "js", "msi", "dll", "scr", "ps1", "vbs", "jar", "com", "hta"]);

export function safeFilename(filename: string): string {
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? "attachment";
  const cleaned = base.replace(/[^\w.\- ()]/g, "_").slice(0, 180);
  return cleaned || "attachment";
}

export function attachmentAllowed(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return !BLOCKED_EXTENSIONS.has(ext);
}

export function messageIdHeader(appMessageId: string): string {
  return `<${appMessageId}@klumail.local>`;
}
