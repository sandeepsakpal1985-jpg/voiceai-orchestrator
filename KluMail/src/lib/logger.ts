const SECRET_KEY = /token|password|secret|authorization|cookie|ciphertext/i;

export function log(level: "info" | "warn" | "error", message: string, fields: Record<string, unknown> = {}): void {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    safe[key] = SECRET_KEY.test(key) ? "[redacted]" : value;
  }
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...safe });
  if (level === "error") console.error(line);
  else console.log(line);
}
