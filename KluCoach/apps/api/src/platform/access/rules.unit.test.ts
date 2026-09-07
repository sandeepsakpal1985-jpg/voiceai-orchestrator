import { describe, expect, it } from "vitest";
import { isDuplicateScan, movementCopy, resolveMovementType } from "./rules.js";

describe("movement rules", () => {
  it("toggles exit after an entry when the reader does not send a direction", () => {
    expect(resolveMovementType(undefined, null)).toBe("ENTRY");
    expect(resolveMovementType(undefined, "ENTRY")).toBe("EXIT");
    expect(resolveMovementType("ENTRY", "ENTRY")).toBe("ENTRY");
  });

  it("treats a repeat scan inside the window as a duplicate", () => {
    const now = new Date("2026-09-05T08:02:00.000Z");
    expect(isDuplicateScan(new Date("2026-09-05T08:01:30.000Z"), now)).toBe(true);
    expect(isDuplicateScan(new Date("2026-09-05T08:00:00.000Z"), now)).toBe(false);
    expect(isDuplicateScan(null, now)).toBe(false);
  });

  it("uses factual entered/left wording with clock time and without location or risk language", () => {
    const at = new Date("2026-09-05T08:32:00.000Z");
    expect(movementCopy("ENTRY", "Aarav", "Demo Coaching Institute", at).body).toBe(
      "Aarav entered Demo Coaching Institute at 08:32.",
    );
    expect(movementCopy("EXIT", "Aarav", "Demo Coaching Institute", at).title).toBe("Left institute");
    expect(movementCopy("EXIT", "Aarav", "Demo Coaching Institute", at).body).toBe(
      "Aarav left Demo Coaching Institute at 08:32.",
    );
  });
});
