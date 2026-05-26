import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock setup at module scope ──────────────────────────────────────
const mockFindMany = vi.fn();
const mockCount = vi.fn();
const mockAuth = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    callLog: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
    user: {
      count: vi.fn().mockResolvedValue(12),
    },
  },
}));

// ── Helpers ─────────────────────────────────────────────────────────

beforeEach(() => {
  mockAuth.mockReset();
  mockAuth.mockResolvedValue({ user: { id: "test-user-id" } });
  mockFindMany.mockReset();
  mockFindMany.mockResolvedValue([]);
  mockCount.mockReset();
  mockCount.mockResolvedValue(0);
});

// ── Live Monitoring ─────────────────────────────────────────────────

describe("GET /api/live-monitoring", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { GET } = await import("@/app/api/live-monitoring/route");
    const response = await GET();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns live monitoring data structure", async () => {
    mockFindMany
      .mockResolvedValueOnce([]) // activeCalls
      .mockResolvedValueOnce([]) // recentInProgress (QUEUED/RINGING)
      .mockResolvedValueOnce([]); // recentCompleted

    mockCount
      .mockResolvedValueOnce(10)  // todayTotal
      .mockResolvedValueOnce(8)   // todayCompleted
      .mockResolvedValueOnce(3);  // inProgressCount

    const { GET } = await import("@/app/api/live-monitoring/route");
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toHaveProperty("activeCalls");
    expect(body).toHaveProperty("queueCount");
    expect(body).toHaveProperty("avgWaitSeconds");
    expect(body).toHaveProperty("activeAgentCount", 12);
    expect(body).toHaveProperty("todayTotal", 10);
    expect(body).toHaveProperty("todayCompleted", 8);
    expect(body).toHaveProperty("answerRate", 80);
  });

  it("returns empty active calls when none in progress", async () => {
    mockFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockCount
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const { GET } = await import("@/app/api/live-monitoring/route");
    const response = await GET();

    const body = await response.json();
    expect(body.activeCalls).toEqual([]);
    expect(body.todayTotal).toBe(0);
    expect(body.answerRate).toBe(0);
  });

  it("formats call duration correctly", async () => {
    mockFindMany
      .mockResolvedValueOnce([
        { id: "call-1", contactName: "Alice", contactPhone: "+15551234567", duration: 185, sentiment: "NEUTRAL", status: "IN_PROGRESS", createdAt: new Date() },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockCount
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1);

    const { GET } = await import("@/app/api/live-monitoring/route");
    const response = await GET();

    const body = await response.json();
    expect(body.activeCalls[0].duration).toBe("3m 05s");
    expect(body.activeCalls[0].contact).toBe("Alice");
    expect(body.activeCalls[0].sentiment).toBe("neutral");
  });

  it("handles anonymous callers", async () => {
    mockFindMany
      .mockResolvedValueOnce([
        { id: "call-2", contactName: null, contactPhone: "", duration: null, sentiment: null, status: "IN_PROGRESS", createdAt: new Date() },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockCount
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);

    const { GET } = await import("@/app/api/live-monitoring/route");
    const response = await GET();

    const body = await response.json();
    expect(body.activeCalls[0].contact).toBe("Unknown Caller");
    expect(body.activeCalls[0].duration).toBe("0m 00s");
    expect(body.activeCalls[0].sentiment).toBe("neutral");
  });
});

// ── Realtime Dashboard ─────────────────────────────────────────────

describe("GET /api/realtime-dashboard", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { GET } = await import("@/app/api/realtime-dashboard/route");
    const response = await GET();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns dashboard data structure with all required fields", async () => {
    // Promise.all order: count×4 then findMany×4
    // Counts: activeCount, todayTotal, inQueueCount, yesterdayTotal
    mockCount
      .mockResolvedValueOnce(2)  // activeCount
      .mockResolvedValueOnce(45) // todayTotal
      .mockResolvedValueOnce(3)  // inQueueCount
      .mockResolvedValueOnce(38); // yesterdayTotal

    // FindManys: inProgressCalls, queuedCalls, ringingCalls, recentCompleted
    mockFindMany
      .mockResolvedValueOnce([{ id: "c1", duration: 120, createdAt: new Date() }]) // inProgress
      .mockResolvedValueOnce([]) // queued
      .mockResolvedValueOnce([]) // ringing
      .mockResolvedValueOnce([]); // completed

    const { GET } = await import("@/app/api/realtime-dashboard/route");
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.activeCalls).toBe(2);
    expect(body.callsToday).toBe(45);
    expect(body.inQueue).toBe(3);
    expect(body.callsYesterday).toBe(38);
    expect(body.pctChange).toBeTypeOf("number");
    expect(body.callFlow).toHaveLength(12);
    expect(body.agentStatuses.length).toBeGreaterThanOrEqual(4);
  });

  it("handles zero calls gracefully", async () => {
    mockCount
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    mockFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { GET } = await import("@/app/api/realtime-dashboard/route");
    const response = await GET();

    const body = await response.json();
    expect(body.activeCalls).toBe(0);
    expect(body.callsToday).toBe(0);
    expect(body.pctChange).toBe(0);
    expect(body.inQueue).toBe(0);
    expect(body.alertsCount).toBe(0);
    expect(body.callFlow).toHaveLength(12);
  });

  it("returns agent statuses with required fields", async () => {
    mockCount
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(3);

    mockFindMany
      .mockResolvedValueOnce([{ id: "c1", duration: 120, createdAt: new Date() }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { GET } = await import("@/app/api/realtime-dashboard/route");
    const response = await GET();

    const body = await response.json();
    for (const agent of body.agentStatuses) {
      expect(agent).toHaveProperty("name");
      expect(agent).toHaveProperty("status");
      expect(agent).toHaveProperty("activeCalls");
      expect(agent).toHaveProperty("avgTime");
      expect(agent).toHaveProperty("today");
    }
  });

  it("each callFlow bucket has required fields", async () => {
    mockCount
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    mockFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ duration: 120, createdAt: new Date() }]);

    const { GET } = await import("@/app/api/realtime-dashboard/route");
    const response = await GET();

    const body = await response.json();
    for (const bucket of body.callFlow) {
      expect(bucket).toHaveProperty("name");
      expect(bucket).toHaveProperty("calls");
      expect(bucket).toHaveProperty("active");
      expect(bucket).toHaveProperty("queued");
      expect(typeof bucket.name).toBe("string");
      expect(typeof bucket.calls).toBe("number");
      expect(typeof bucket.active).toBe("number");
      expect(typeof bucket.queued).toBe("number");
    }
  });
});
