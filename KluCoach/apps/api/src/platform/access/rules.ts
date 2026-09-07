import { MOVEMENT_DUPLICATE_WINDOW_MS } from "@klunex-edu/shared";

export function resolveMovementType(requested: "ENTRY" | "EXIT" | undefined, lastType: string | null) {
  if (requested === "ENTRY" || requested === "EXIT") return requested;
  if (lastType === "ENTRY") return "EXIT";
  return "ENTRY";
}

export function isDuplicateScan(lastOccurredAt: Date | null, now: Date, windowMs = MOVEMENT_DUPLICATE_WINDOW_MS) {
  if (!lastOccurredAt) return false;
  return now.getTime() - lastOccurredAt.getTime() < windowMs;
}

export function movementClock(at: Date) {
  return `${String(at.getUTCHours()).padStart(2, "0")}:${String(at.getUTCMinutes()).padStart(2, "0")}`;
}

export function movementCopy(
  type: "ENTRY" | "EXIT",
  firstName: string,
  institutionName: string,
  occurredAt = new Date(),
): { title: string; body: string } {
  const at = movementClock(occurredAt);
  if (type === "ENTRY") {
    return {
      title: "Entered institute",
      body: `${firstName} entered ${institutionName} at ${at}.`,
    };
  }
  return {
    title: "Left institute",
    body: `${firstName} left ${institutionName} at ${at}.`,
  };
}
