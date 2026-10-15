export function parseMentions(body: string): { emails: string[]; userIds: string[] } {
  const emails = [...body.matchAll(/@([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi)].map((match) => match[1]?.toLowerCase() ?? "");
  const userIds = [...body.matchAll(/@\[user:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi)].map((match) => match[1] ?? "");
  return {
    emails: [...new Set(emails.filter(Boolean))],
    userIds: [...new Set(userIds.filter(Boolean))],
  };
}
