import { describe, it, expect } from "vitest";
import {
  cn,
  formatDuration,
  formatCost,
  formatDate,
  formatRelativeTime,
  formatFileSize,
  getInitials,
  truncate,
  generateId,
} from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("merges tailwind classes correctly", () => {
    expect(cn("px-4", "px-2")).toBe("px-2");
  });
});

describe("formatDuration", () => {
  it("formats seconds only", () => {
    expect(formatDuration(45)).toBe("45s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(125)).toBe("2m 5s");
  });

  it("formats hours, minutes, and seconds", () => {
    expect(formatDuration(3661)).toBe("1h 1m 1s");
  });

  it("handles zero", () => {
    expect(formatDuration(0)).toBe("0s");
  });
});

describe("formatCost", () => {
  it("formats cost as currency", () => {
    const result = formatCost(0.042);
    expect(result).toContain("$");
  });

  it("uses default USD currency", () => {
    const result = formatCost(99.99);
    expect(result).toContain("$");
  });

  it("accepts custom currency", () => {
    const result = formatCost(10, "EUR");
    expect(result).toContain("€");
  });
});

describe("formatDate", () => {
  it("formats a date string", () => {
    const result = formatDate("2024-01-15T00:00:00Z");
    expect(result).toContain("Jan");
    expect(result).toContain("15");
    expect(result).toContain("2024");
  });

  it("formats a Date object", () => {
    const result = formatDate(new Date("2024-06-01"));
    expect(result).toContain("Jun");
  });
});

describe("formatRelativeTime", () => {
  it('returns "just now" for recent dates', () => {
    expect(formatRelativeTime(new Date())).toBe("just now");
  });

  it("returns minutes ago", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelativeTime(fiveMinAgo)).toBe("5m ago");
  });

  it("returns hours ago", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(formatRelativeTime(threeHoursAgo)).toBe("3h ago");
  });

  it("returns days ago", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(twoDaysAgo)).toBe("2d ago");
  });
});

describe("formatFileSize", () => {
  it("formats bytes", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    const result = formatFileSize(2048);
    expect(result).toContain("KB");
    expect(Number(result.split(" ")[0])).toBeCloseTo(2.0, 0);
  });

  it("formats megabytes", () => {
    const result = formatFileSize(1048576);
    expect(result).toContain("MB");
    expect(Number(result.split(" ")[0])).toBeCloseTo(1.0, 0);
  });

  it("handles zero", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });
});

describe("getInitials", () => {
  it("extracts initials from full name", () => {
    expect(getInitials("John Doe")).toBe("JD");
  });

  it("handles single name", () => {
    expect(getInitials("Alice")).toBe("A");
  });

  it("returns uppercase", () => {
    expect(getInitials("john doe")).toBe("JD");
  });

  it("limits to 2 characters", () => {
    expect(getInitials("John Michael Doe")).toBe("JM");
  });
});

describe("truncate", () => {
  it("returns string if shorter than length", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates string with ellipsis", () => {
    expect(truncate("hello world this is long", 10)).toBe("hello worl...");
  });

  it("handles exact length", () => {
    expect(truncate("12345", 5)).toBe("12345");
  });
});

describe("generateId", () => {
  it("generates a non-empty string", () => {
    expect(generateId().length).toBeGreaterThan(0);
  });

  it("generates unique ids", () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });
});
