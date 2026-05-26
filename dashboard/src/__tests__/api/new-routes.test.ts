import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock setup at module scope ──────────────────────────────────────
const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockDeleteMany = vi.fn();
const mockCount = vi.fn();
const mockAuth = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    agent: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
    agentTool: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
    agentSocialAccount: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
    pipeline: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
    pipelineStage: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findUnique: (...args: unknown[]) => mockFindFirst(...args),
    },
    lead: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
    activityLog: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
    socialConnection: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

// ── Helpers ─────────────────────────────────────────────────────────

beforeEach(() => {
  mockAuth.mockReset();
  mockAuth.mockResolvedValue({ user: { id: "test-user-id" } });
  mockFindMany.mockReset();
  mockFindFirst.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
  mockDeleteMany.mockReset();
  mockCount.mockReset();
});

function mockRequest(method: string, body?: unknown, searchParams?: string): NextRequest {
  const url = searchParams ? `http://localhost:3000/api/test?${searchParams}` : "http://localhost:3000/api/test";
  const init: Record<string, unknown> = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new NextRequest(url, init);
}

function mockParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// =========================================================================
// Agents API
// =========================================================================

describe("GET /api/agents", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { GET } = await import("@/app/api/agents/route");
    const response = await GET(mockRequest("GET"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns agents list with tools and socialAccounts", async () => {
    const mockAgents = [
      { id: "agent-1", name: "Sales Agent", tools: [], socialAccounts: [] },
      { id: "agent-2", name: "Support Agent", tools: [], socialAccounts: [] },
    ];
    mockFindMany.mockResolvedValue(mockAgents);

    const { GET } = await import("@/app/api/agents/route");
    const response = await GET(mockRequest("GET"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.agents).toEqual(mockAgents);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "test-user-id" } })
    );
  });

  it("returns empty array when no agents exist", async () => {
    mockFindMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/agents/route");
    const response = await GET(mockRequest("GET"));

    const body = await response.json();
    expect(body.agents).toEqual([]);
  });
});

describe("POST /api/agents", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { POST } = await import("@/app/api/agents/route");
    const response = await POST(mockRequest("POST", { name: "Test" }));

    expect(response.status).toBe(401);
  });

  it("creates an agent with defaults", async () => {
    const created = { id: "agent-new", name: "Test Agent", systemPrompt: "You are helpful", tools: [], socialAccounts: [] };
    mockCreate.mockResolvedValue(created);

    const { POST } = await import("@/app/api/agents/route");
    const response = await POST(
      mockRequest("POST", { name: "Test Agent", systemPrompt: "You are helpful" })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.agent).toEqual(created);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "test-user-id",
          name: "Test Agent",
          language: "en-US",
          temperature: 0.7,
        }),
      })
    );
  });

  it("creates an agent with custom fields", async () => {
    const created = {
      id: "agent-custom", name: "Custom Agent", systemPrompt: "Custom prompt",
      voiceId: "voice-1", language: "es-ES", temperature: 0.9, tools: [], socialAccounts: [],
    };
    mockCreate.mockResolvedValue(created);

    const { POST } = await import("@/app/api/agents/route");
    const response = await POST(
      mockRequest("POST", {
        name: "Custom Agent", systemPrompt: "Custom prompt",
        voiceId: "voice-1", language: "es-ES", temperature: 0.9,
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.agent.language).toBe("es-ES");
    expect(body.agent.temperature).toBe(0.9);
  });
});

// =========================================================================
// Agents [id] API
// =========================================================================

describe("GET /api/agents/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { GET } = await import("@/app/api/agents/[id]/route");
    const response = await GET(mockRequest("GET"), mockParams("agent-1"));

    expect(response.status).toBe(401);
  });

  it("returns agent by id", async () => {
    const agent = { id: "agent-1", name: "Sales Agent", tools: [], socialAccounts: [] };
    mockFindFirst.mockResolvedValue(agent);

    const { GET } = await import("@/app/api/agents/[id]/route");
    const response = await GET(mockRequest("GET"), mockParams("agent-1"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.agent).toEqual(agent);
  });

  it("returns 404 when agent not found", async () => {
    mockFindFirst.mockResolvedValue(null);

    const { GET } = await import("@/app/api/agents/[id]/route");
    const response = await GET(mockRequest("GET"), mockParams("nonexistent"));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Agent not found");
  });
});

describe("PUT /api/agents/[id]", () => {
  it("updates agent name", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: "agent-1", userId: "test-user-id" });
    const updated = { id: "agent-1", name: "Updated Name", tools: [], socialAccounts: [] };
    mockUpdate.mockResolvedValue(updated);

    const { PUT } = await import("@/app/api/agents/[id]/route");
    const response = await PUT(
      mockRequest("PUT", { name: "Updated Name" }),
      mockParams("agent-1")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.agent.name).toBe("Updated Name");
  });

  it("returns 404 when updating nonexistent agent", async () => {
    mockFindFirst.mockResolvedValue(null);

    const { PUT } = await import("@/app/api/agents/[id]/route");
    const response = await PUT(
      mockRequest("PUT", { name: "Nope" }),
      mockParams("nonexistent")
    );

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/agents/[id]", () => {
  it("deletes agent", async () => {
    mockFindFirst.mockResolvedValue({ id: "agent-1", userId: "test-user-id" });
    mockDelete.mockResolvedValue({ id: "agent-1" });

    const { DELETE } = await import("@/app/api/agents/[id]/route");
    const response = await DELETE(mockRequest("DELETE"), mockParams("agent-1"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it("returns 404 when deleting nonexistent agent", async () => {
    mockFindFirst.mockResolvedValue(null);

    const { DELETE } = await import("@/app/api/agents/[id]/route");
    const response = await DELETE(mockRequest("DELETE"), mockParams("nonexistent"));

    expect(response.status).toBe(404);
  });
});

// =========================================================================
// Agents [id] Tools API
// =========================================================================

describe("GET /api/agents/[id]/tools", () => {
  it("returns tools for an agent", async () => {
    const tools = [
      { id: "tool-1", name: "Calculator", type: "function", enabled: true },
    ];
    mockFindMany.mockResolvedValue(tools);

    const { GET } = await import("@/app/api/agents/[id]/tools/route");
    const response = await GET(mockRequest("GET"), mockParams("agent-1"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.tools).toEqual(tools);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { GET } = await import("@/app/api/agents/[id]/tools/route");
    const response = await GET(mockRequest("GET"), mockParams("agent-1"));

    expect(response.status).toBe(401);
  });
});

describe("POST /api/agents/[id]/tools", () => {
  it("creates a tool for an agent", async () => {
    mockFindFirst.mockResolvedValue({ id: "agent-1", userId: "test-user-id" });
    const tool = { id: "tool-new", name: "Webhook", type: "webhook", enabled: true };
    mockCreate.mockResolvedValue(tool);

    const { POST } = await import("@/app/api/agents/[id]/tools/route");
    const response = await POST(
      mockRequest("POST", { name: "Webhook", type: "webhook" }),
      mockParams("agent-1")
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.tool).toEqual(tool);
  });

  it("returns 404 when agent does not exist", async () => {
    mockFindFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/agents/[id]/tools/route");
    const response = await POST(
      mockRequest("POST", { name: "Tool", type: "function" }),
      mockParams("nonexistent")
    );

    expect(response.status).toBe(404);
  });
});

// =========================================================================
// Agents [id] Social API
// =========================================================================

describe("GET /api/agents/[id]/social", () => {
  it("returns social accounts for an agent", async () => {
    const accounts = [
      { id: "sa-1", platform: "instagram", accountId: "ig-123", enabled: true },
    ];
    mockFindMany.mockResolvedValue(accounts);

    const { GET } = await import("@/app/api/agents/[id]/social/route");
    const response = await GET(mockRequest("GET"), mockParams("agent-1"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.socialAccounts).toEqual(accounts);
  });
});

describe("POST /api/agents/[id]/social", () => {
  it("connects a social account and marks agent as social-connected", async () => {
    mockFindFirst.mockResolvedValue({ id: "agent-1", userId: "test-user-id" });
    const account = { id: "sa-new", platform: "facebook", accountId: "fb-456", enabled: true };
    mockCreate.mockResolvedValue(account);
    mockUpdate.mockResolvedValue({});

    const { POST } = await import("@/app/api/agents/[id]/social/route");
    const response = await POST(
      mockRequest("POST", { platform: "facebook", accountId: "fb-456" }),
      mockParams("agent-1")
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.socialAccount.platform).toBe("facebook");
    // Should mark agent as social-connected
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "agent-1" },
        data: { socialConnected: true },
      })
    );
  });

  it("returns 404 when agent does not exist", async () => {
    mockFindFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/agents/[id]/social/route");
    const response = await POST(
      mockRequest("POST", { platform: "instagram", accountId: "ig-789" }),
      mockParams("nonexistent")
    );

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/agents/[id]/social", () => {
  it("removes a social account", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });
    mockCount.mockResolvedValue(1); // remaining > 0, so don't update socialConnected

    const { DELETE } = await import("@/app/api/agents/[id]/social/route");
    const response = await DELETE(
      mockRequest("DELETE", undefined, "accountId=sa-1"),
      mockParams("agent-1")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it("requires accountId query param", async () => {
    const { DELETE } = await import("@/app/api/agents/[id]/social/route");
    const response = await DELETE(
      mockRequest("DELETE"),
      mockParams("agent-1")
    );

    expect(response.status).toBe(400);
  });

  it("sets socialConnected to false when no accounts remain", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });
    mockCount.mockResolvedValue(0); // no remaining accounts
    mockUpdate.mockResolvedValue({});

    const { DELETE } = await import("@/app/api/agents/[id]/social/route");
    const response = await DELETE(
      mockRequest("DELETE", undefined, "accountId=sa-last"),
      mockParams("agent-1")
    );

    expect(response.status).toBe(200);
    // Should set socialConnected to false
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "agent-1" },
        data: { socialConnected: false },
      })
    );
  });
});

// =========================================================================
// CRM Pipelines API
// =========================================================================

describe("GET /api/crm/pipelines", () => {
  it("returns pipelines with stages and lead counts", async () => {
    const pipelines = [
      { id: "pipe-1", name: "Sales Pipeline", stages: [], _count: { leads: 5 } },
    ];
    mockFindMany.mockResolvedValue(pipelines);

    const { GET } = await import("@/app/api/crm/pipelines/route");
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pipelines).toEqual(pipelines);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { GET } = await import("@/app/api/crm/pipelines/route");
    const response = await GET();

    expect(response.status).toBe(401);
  });
});

describe("POST /api/crm/pipelines", () => {
  it("creates a pipeline with default stages", async () => {
    mockCreate.mockResolvedValue({
      id: "pipe-new", name: "New Pipeline",
      stages: [
        { name: "New Lead", order: 0 },
        { name: "Contacted", order: 1 },
        { name: "Qualified", order: 2 },
        { name: "Negotiating", order: 3 },
        { name: "Closed Won", order: 4 },
      ],
    });

    const { POST } = await import("@/app/api/crm/pipelines/route");
    const response = await POST(
      mockRequest("POST", { name: "New Pipeline" })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.pipeline.name).toBe("New Pipeline");
  });

  it("creates pipeline with custom stages", async () => {
    mockCreate.mockResolvedValue({
      id: "pipe-custom", name: "Custom Pipeline",
      stages: [
        { name: "Prospecting", order: 0 },
        { name: "Closed Won", order: 1 },
      ],
    });

    const { POST } = await import("@/app/api/crm/pipelines/route");
    const response = await POST(
      mockRequest("POST", {
        name: "Custom Pipeline",
        stages: [{ name: "Prospecting" }, { name: "Closed Won" }],
      })
    );

    expect(response.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Custom Pipeline" }),
      })
    );
  });
});

// =========================================================================
// CRM Leads API
// =========================================================================

describe("GET /api/crm/leads", () => {
  it("returns leads with related data", async () => {
    const leads = [
      { id: "lead-1", contactName: "John Doe", pipeline: {}, stage: {}, activities: [] },
    ];
    mockFindMany.mockResolvedValue(leads);

    const { GET } = await import("@/app/api/crm/leads/route");
    const response = await GET(mockRequest("GET"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.leads).toEqual(leads);
  });

  it("filters leads by pipeline and stage", async () => {
    mockFindMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/crm/leads/route");
    await GET(mockRequest("GET", undefined, "pipelineId=pipe-1&stageId=stage-1"));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          pipelineId: "pipe-1",
          stageId: "stage-1",
        }),
      })
    );
  });

  it("searches leads by name, email, phone, or company", async () => {
    mockFindMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/crm/leads/route");
    await GET(mockRequest("GET", undefined, "search=John"));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ contactName: expect.any(Object) }),
          ]),
        }),
      })
    );
  });
});

describe("POST /api/crm/leads", () => {
  it("creates a lead and logs activity", async () => {
    const lead = { id: "lead-new", contactName: "Jane", pipeline: {}, stage: {} };
    mockCreate.mockResolvedValue(lead);

    const { POST } = await import("@/app/api/crm/leads/route");
    const response = await POST(
      mockRequest("POST", { contactName: "Jane", contactEmail: "jane@test.com" })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.lead.contactName).toBe("Jane");
    // Should have logged an activity
    expect(mockCreate).toHaveBeenCalled();
  });
});

describe("PUT /api/crm/leads", () => {
  it("updates a lead and logs stage changes", async () => {
    mockFindFirst
      .mockResolvedValueOnce({ id: "lead-1", userId: "test-user-id", stageId: "stage-old" })
      .mockResolvedValueOnce({ id: "stage-old", name: "New Lead" })
      .mockResolvedValueOnce({ id: "stage-new", name: "Qualified" });
    mockUpdate.mockResolvedValue({ id: "lead-1", stageId: "stage-new", pipeline: {}, stage: {} });

    const { PUT } = await import("@/app/api/crm/leads/route");
    const response = await PUT(
      mockRequest("PUT", { id: "lead-1", stageId: "stage-new" })
    );

    expect(response.status).toBe(200);
    // Should have created an activity log for the stage change
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "system",
          content: expect.stringContaining("Moved from"),
        }),
      })
    );
  });

  it("returns 404 for nonexistent lead", async () => {
    mockFindFirst.mockResolvedValue(null);

    const { PUT } = await import("@/app/api/crm/leads/route");
    const response = await PUT(
      mockRequest("PUT", { id: "nonexistent", contactName: "Test" })
    );

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/crm/leads", () => {
  it("deletes a lead by id query param", async () => {
    mockFindFirst.mockResolvedValue({ id: "lead-1", userId: "test-user-id" });
    mockDelete.mockResolvedValue({});

    const { DELETE } = await import("@/app/api/crm/leads/route");
    const response = await DELETE(mockRequest("DELETE", undefined, "id=lead-1"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it("returns 400 when no id provided", async () => {
    const { DELETE } = await import("@/app/api/crm/leads/route");
    const response = await DELETE(mockRequest("DELETE"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Lead ID required");
  });

  it("returns 404 when lead not found", async () => {
    mockFindFirst.mockResolvedValue(null);

    const { DELETE } = await import("@/app/api/crm/leads/route");
    const response = await DELETE(mockRequest("DELETE", undefined, "id=nonexistent"));

    expect(response.status).toBe(404);
  });
});

// =========================================================================
// CRM Leads Activities API
// =========================================================================

describe("GET /api/crm/leads/[id]/activities", () => {
  it("returns activities for a lead", async () => {
    const activities = [
      { id: "act-1", type: "note", content: "Called customer", createdAt: new Date().toISOString() },
    ];
    mockFindMany.mockResolvedValue(activities);

    const { GET } = await import("@/app/api/crm/leads/[id]/activities/route");
    const response = await GET(mockRequest("GET"), mockParams("lead-1"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.activities[0].id).toBe("act-1");
    expect(body.activities[0].type).toBe("note");
    expect(body.activities[0].content).toBe("Called customer");
    expect(body.activities[0].createdAt).toEqual(expect.any(String));
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { GET } = await import("@/app/api/crm/leads/[id]/activities/route");
    const response = await GET(mockRequest("GET"), mockParams("lead-1"));

    expect(response.status).toBe(401);
  });
});

describe("POST /api/crm/leads/[id]/activities", () => {
  it("logs an activity and updates lastContactedAt for contact types", async () => {
    mockFindFirst.mockResolvedValue({ id: "lead-1", userId: "test-user-id" });
    const activity = { id: "act-new", type: "call", content: "Spoke about pricing" };
    mockCreate.mockResolvedValue(activity);
    mockUpdate.mockResolvedValue({});

    const { POST } = await import("@/app/api/crm/leads/[id]/activities/route");
    const response = await POST(
      mockRequest("POST", { type: "call", content: "Spoke about pricing" }),
      mockParams("lead-1")
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.activity.type).toBe("call");
    // Should update lastContactedAt
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lead-1" },
        data: expect.objectContaining({ lastContactedAt: expect.any(Date) }),
      })
    );
  });

  it("does not update lastContactedAt for note type", async () => {
    mockFindFirst.mockResolvedValue({ id: "lead-1", userId: "test-user-id" });
    const activity = { id: "act-note", type: "note", content: "Just a note" };
    mockCreate.mockResolvedValue(activity);

    const { POST } = await import("@/app/api/crm/leads/[id]/activities/route");
    const response = await POST(
      mockRequest("POST", { type: "note", content: "Just a note" }),
      mockParams("lead-1")
    );

    expect(response.status).toBe(201);
    // Should NOT update lastContactedAt for notes
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when lead not found", async () => {
    mockFindFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/crm/leads/[id]/activities/route");
    const response = await POST(
      mockRequest("POST", { type: "note", content: "Test" }),
      mockParams("nonexistent")
    );

    expect(response.status).toBe(404);
  });
});

// =========================================================================
// Social Connections API
// =========================================================================

describe("GET /api/social/connections", () => {
  it("returns social connections", async () => {
    const connections = [
      { id: "conn-1", platform: "instagram", accountName: "My Business", status: "connected" },
    ];
    mockFindMany.mockResolvedValue(connections);

    const { GET } = await import("@/app/api/social/connections/route");
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.connections).toEqual(connections);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { GET } = await import("@/app/api/social/connections/route");
    const response = await GET();

    expect(response.status).toBe(401);
  });
});

describe("POST /api/social/connections", () => {
  it("creates a social connection", async () => {
    const connection = {
      id: "conn-new", platform: "facebook", accountId: "fb-page-1",
      accountName: "FB Page", status: "connected",
    };
    mockCreate.mockResolvedValue(connection);

    const { POST } = await import("@/app/api/social/connections/route");
    const response = await POST(
      mockRequest("POST", {
        platform: "facebook",
        accountId: "fb-page-1",
        accountName: "FB Page",
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.connection.platform).toBe("facebook");
    expect(body.connection.status).toBe("connected");
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { POST } = await import("@/app/api/social/connections/route");
    const response = await POST(
      mockRequest("POST", { platform: "instagram", accountId: "ig-1" })
    );

    expect(response.status).toBe(401);
  });
});
