import { describe, expect, it } from "vitest";
import { decideStudent360Status, trendFromRates } from "./student360-status.js";

describe("student 360 status engine", () => {
  it("returns insufficient data when there are no attendance or results", () => {
    const out = decideStudent360Status({
      attendanceCount: 0,
      attendancePercent: null,
      resultCount: 0,
      academicAverage: null,
      overdue: 0,
      academicTrend: "INSUFFICIENT_DATA",
    });
    expect(out.status).toBe("INSUFFICIENT_DATA");
    expect(out.statusLabel).toBe("Not enough data");
  });

  it("flags needs attention for low attendance", () => {
    const out = decideStudent360Status({
      attendanceCount: 10,
      attendancePercent: 70,
      resultCount: 3,
      academicAverage: 80,
      overdue: 0,
      academicTrend: "STABLE",
    });
    expect(out.status).toBe("NEEDS_ATTENTION");
  });

  it("returns doing well when attendance and academics are healthy", () => {
    const out = decideStudent360Status({
      attendanceCount: 10,
      attendancePercent: 91,
      resultCount: 4,
      academicAverage: 82,
      overdue: 0,
      academicTrend: "STABLE",
    });
    expect(out.status).toBe("DOING_WELL");
  });

  it("stays on track when attendance exists but academics do not", () => {
    const out = decideStudent360Status({
      attendanceCount: 8,
      attendancePercent: 90,
      resultCount: 0,
      academicAverage: null,
      overdue: 0,
      academicTrend: "INSUFFICIENT_DATA",
    });
    expect(out.status).toBe("ON_TRACK");
  });

  it("computes simple trends without inventing data", () => {
    expect(trendFromRates(70, 82, 4, 2, 2)).toBe("IMPROVING");
    expect(trendFromRates(80, 78, 4, 2, 2)).toBe("STABLE");
    expect(trendFromRates(null, 80, 4, 0, 3)).toBe("INSUFFICIENT_DATA");
  });
});
