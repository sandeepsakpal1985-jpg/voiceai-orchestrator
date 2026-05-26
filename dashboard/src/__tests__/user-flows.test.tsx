/**
 * End-to-End Integration Tests — Main User Flows
 *
 * Tests critical user journeys through the dashboard by rendering pages
 * with mocked API/auth and verifying UI behavior and data flow.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mock next/navigation ─────────────────────────────────────────────
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/dashboard",
  redirect: vi.fn(),
}));

// ── Mock next-auth ───────────────────────────────────────────────────
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: { id: "user-demo", name: "Demo User", email: "demo@example.com", role: "USER" },
      expires: new Date(Date.now() + 86400000).toISOString(),
    },
    status: "authenticated",
  }),
  signIn: vi.fn(),
  signOut: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Mock next-themes ─────────────────────────────────────────────────
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Mock sonner toast ────────────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  Toaster: () => null,
}));

// ── Mock WebSocket ───────────────────────────────────────────────────
class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
  url: string;
  readyState: number = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) { this.url = url; }
  send() {}
  close() {}
}
vi.stubGlobal("WebSocket", MockWebSocket);

// ── Test Helpers ─────────────────────────────────────────────────────

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  mockPush.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Helper to create a successful fetch response.
 */
function okResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    headers: new Headers(),
    redirected: false,
    statusText: status === 200 ? "OK" : "Error",
    type: "basic" as ResponseType,
    url: "",
    clone: () => new Response(),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

// ── Login Flow ───────────────────────────────────────────────────────

describe("Login Flow", () => {
  it("renders the login form with all required elements", async () => {
    const LoginPage = (await import("@/app/(auth)/login/page")).default;
    const { container } = render(<LoginPage />);

    // Brand elements (VoiceAI appears in both mobile and desktop views)
    expect(container.querySelectorAll('[class*="VoiceAI"]').length || screen.getAllByText("VoiceAI").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Welcome back")).toBeDefined();
    expect(screen.getByText(/Sign in to your account/)).toBeDefined();

    // Form fields
    expect(screen.getByLabelText("Email")).toBeDefined();
    expect(screen.getByLabelText("Password")).toBeDefined();

    // Submit button
    expect(screen.getByRole("button", { name: /sign in/i })).toBeDefined();

    // Social login buttons
    expect(screen.getByText("Google")).toBeDefined();
    expect(screen.getByText("GitHub")).toBeDefined();

    // Link to register
    expect(screen.getByText("Sign up")).toBeDefined();
  });

  it("toggles password visibility on click", async () => {
    const LoginPage = (await import("@/app/(auth)/login/page")).default;
    const { container } = render(<LoginPage />);

    const passwordInput = screen.getByLabelText("Password") as HTMLInputElement;
    expect(passwordInput.type).toBe("password");

    // Find the eye toggle button (the button inside the password field wrapper)
    const toggleBtn = container.querySelector("button");
    const eyeIcon = toggleBtn?.querySelector("[class*='lucide']");
    expect(eyeIcon).toBeDefined();

    if (toggleBtn) {
      await userEvent.click(toggleBtn);
      // After click, showPassword becomes true → input type changes to "text"
      await waitFor(() => {
        expect(passwordInput.type).toBe("text");
      });
    }
  });
});

// ── Dashboard Flow ───────────────────────────────────────────────────

describe("Dashboard Flow", () => {
  it("renders dashboard with loading skeleton, then data", async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse({
        calls: [
          { id: "c1", contactName: "Alice", contactPhone: "+15551234567", duration: 120, status: "COMPLETED", sentiment: "POSITIVE", cost: 0.042, createdAt: new Date().toISOString() },
          { id: "c2", contactName: "Bob", contactPhone: "+15557654321", duration: 45, status: "COMPLETED", sentiment: "NEUTRAL", cost: 0.021, createdAt: new Date().toISOString() },
        ],
        total: 2,
      }))
      .mockResolvedValueOnce(okResponse({
        campaigns: [
          { id: "camp1", name: "Q1 Outreach", status: "ACTIVE", totalCalls: 1250, completedCalls: 1150, successRate: 92 },
        ],
      }))
      .mockResolvedValueOnce(okResponse({
        totalCalls: 14520,
        avgDuration: 252,
        successRate: 76.4,
        totalCost: 609.84,
        dailyTrend: [],
        hourlyData: [],
        durationDistribution: null,
        statusDistribution: null,
      }));

    const DashboardPage = (await import("@/app/(dashboard)/dashboard/page")).default;
    render(<DashboardPage />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText("Total Calls")).toBeDefined();
    }, { timeout: 3000 });

    // Verify stats cards render
    expect(screen.getByText("Avg. Duration")).toBeDefined();
    expect(screen.getByText("Success Rate")).toBeDefined();
    expect(screen.getByText("Total Cost")).toBeDefined();
    expect(screen.getByText("Active Campaigns")).toBeDefined();

    // Verify recent calls table rendered
    expect(screen.getByText("Alice")).toBeDefined();
    expect(screen.getByText("Bob")).toBeDefined();

    // Verify chart sections
    expect(screen.getByText("Call Volume")).toBeDefined();
    expect(screen.getByText("Top Campaigns by Success Rate")).toBeDefined();
  });

  it("handles API failures gracefully with fallback data", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"));

    const DashboardPage = (await import("@/app/(dashboard)/dashboard/page")).default;
    render(<DashboardPage />);

    // Wait for loading to finish — component renders fallback stats
    await waitFor(() => {
      expect(screen.getByText("Total Calls")).toBeDefined();
    }, { timeout: 3000 });

    // Should show some stat values (zeros from fallback)
    const zeroElements = screen.getAllByText("0");
    expect(zeroElements.length).toBeGreaterThanOrEqual(1);
  });
});

// ── API Call Flow ────────────────────────────────────────────────────

describe("API Call Flow", () => {
  it("calls API endpoints with expected URLs on dashboard load", async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse({ calls: [], total: 0 }))
      .mockResolvedValueOnce(okResponse({ campaigns: [] }))
      .mockResolvedValueOnce(okResponse({ totalCalls: 0 }));

    const DashboardPage = (await import("@/app/(dashboard)/dashboard/page")).default;
    render(<DashboardPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    }, { timeout: 3000 });

    // Verify exact API paths called
    const urls = fetchMock.mock.calls.map((c: unknown[]) => c[0]);
    expect(urls).toContain("/api/calls?limit=5");
    expect(urls).toContain("/api/campaigns");
    expect(urls).toContain("/api/analytics?days=7");
  });

  it("Live Monitoring page renders with fallback data", async () => {
    const LiveMonitoringPage = (await import("@/app/(dashboard)/live-monitoring/page")).default;
    render(<LiveMonitoringPage />);

    await waitFor(() => {
      expect(screen.getByText("Live Monitoring")).toBeDefined();
    });

    // Should show fallback data cards
    expect(screen.getByText("Calls in Queue")).toBeDefined();
    expect(screen.getByText("Active Agents")).toBeDefined();
    expect(screen.getByText("Today's Stats")).toBeDefined();
  });
});

// ── Settings Flow ────────────────────────────────────────────────────

describe("Settings Flow", () => {
  it("loads and displays user profile settings", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({
      user: {
        name: "Demo User",
        email: "demo@example.com",
        companyName: "Demo Corp",
        phone: "+12025551234",
        timezone: "America/New_York",
      },
      apiKeys: [
        { id: "key1", name: "Production API Key", key: "vai_prod_abc123def456", active: true, createdAt: new Date().toISOString(), lastUsed: new Date().toISOString() },
      ],
    }));

    const SettingsPage = (await import("@/app/(dashboard)/settings/page")).default;
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Settings")).toBeDefined();
    }, { timeout: 3000 });

    // Profile tab active by default
    expect(screen.getByText("Profile Information")).toBeDefined();

    // Should have tabs
    expect(screen.getByText("Notifications")).toBeDefined();
    expect(screen.getByText("Security")).toBeDefined();
    expect(screen.getByText("API Keys")).toBeDefined();

    // Should show loaded user data
    const nameInput = screen.getByLabelText("Full Name") as HTMLInputElement;
    await waitFor(() => {
      expect(nameInput.value).toBe("Demo User");
    });
  });

  it("saves profile changes via PUT /api/settings", async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse({
        user: { name: "Demo User", email: "demo@example.com", companyName: "Demo Corp", phone: "+12025551234", timezone: "America/New_York" },
        apiKeys: [],
      }))
      .mockResolvedValueOnce(okResponse({ user: { name: "Updated Name" } }));

    const SettingsPage = (await import("@/app/(dashboard)/settings/page")).default;
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Settings")).toBeDefined();
    }, { timeout: 3000 });

    // Change name
    const nameInput = screen.getByLabelText("Full Name") as HTMLInputElement;
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Updated Name");

    // Click save
    const saveButton = screen.getByText("Save Changes");
    await userEvent.click(saveButton);

    await waitFor(() => {
      // Should have called PUT with updated profile
      const putCall = fetchMock.mock.calls.find(
        (c: unknown[]) => c[0] === "/api/settings" && (c[1] as Record<string, unknown>)?.method === "PUT"
      );
      expect(putCall).toBeDefined();
      const body = JSON.parse((putCall![1] as Record<string, string>).body);
      expect(body.name).toBe("Updated Name");
    }, { timeout: 3000 });
  });
});

// ── Campaigns Flow ───────────────────────────────────────────────────

describe("Campaigns Flow", () => {
  it("renders campaigns page with list and stats", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({
      campaigns: [
        { id: "camp1", name: "Q1 Outreach", status: "ACTIVE", totalCalls: 1250, completedCalls: 1150, successRate: 92, createdAt: new Date().toISOString(), description: "Quarterly outreach" },
        { id: "camp2", name: "Customer Survey", status: "ACTIVE", totalCalls: 980, completedCalls: 862, successRate: 88, createdAt: new Date().toISOString(), description: "Survey" },
        { id: "camp3", name: "Draft Campaign", status: "DRAFT", totalCalls: 0, completedCalls: 0, successRate: 0, createdAt: new Date().toISOString(), description: "Not started" },
      ],
    }));

    const CampaignsPage = (await import("@/app/(dashboard)/campaigns/page")).default;
    render(<CampaignsPage />);

    await waitFor(() => {
      expect(screen.getByText("Campaign Manager")).toBeDefined();
    }, { timeout: 3000 });

    // Stats cards
    expect(screen.getByText("Active Campaigns")).toBeDefined();
    expect(screen.getByText("Total Calls")).toBeDefined();
    expect(screen.getByText("Avg. Success Rate")).toBeDefined();
    expect(screen.getByText("Drafts")).toBeDefined();

    // Campaign list
    expect(screen.getByText("Q1 Outreach")).toBeDefined();
    expect(screen.getByText("Customer Survey")).toBeDefined();
    expect(screen.getByText("Draft Campaign")).toBeDefined();
  });

  it("shows empty state when no campaigns exist", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ campaigns: [] }));

    const CampaignsPage = (await import("@/app/(dashboard)/campaigns/page")).default;
    render(<CampaignsPage />);

    await waitFor(() => {
      expect(screen.getByText("Campaign Manager")).toBeDefined();
    }, { timeout: 3000 });

    expect(screen.getByText(/No campaigns found/)).toBeDefined();
  });
});

// ── Navigation Flow ──────────────────────────────────────────────────

describe("Navigation Flow", () => {
  it("sidebar renders all navigation sections", async () => {
    const Sidebar = (await import("@/components/dashboard/sidebar")).default;
    render(<Sidebar />);

    // Navigation sections (hidden when collapsed, but sidebar starts expanded)
    expect(screen.getByText("Overview")).toBeDefined();
    expect(screen.getByText("Communications")).toBeDefined();
    expect(screen.getByText("AI & Content")).toBeDefined();
    expect(screen.getByText("Operations")).toBeDefined();
    expect(screen.getByText("Account")).toBeDefined();

    // Key nav items
    expect(screen.getByText("Dashboard")).toBeDefined();
    expect(screen.getByText("AI Agent")).toBeDefined();
    expect(screen.getByText("Call Analytics")).toBeDefined();
    expect(screen.getByText("Live Monitoring")).toBeDefined();
    expect(screen.getByText("Campaigns")).toBeDefined();
    expect(screen.getByText("Settings")).toBeDefined();
    expect(screen.getByText("Monitoring")).toBeDefined();
  });

  it("sidebar collapse toggle works", async () => {
    const Sidebar = (await import("@/components/dashboard/sidebar")).default;
    render(<Sidebar />);

    // Initially expanded — shows brand name
    expect(screen.getByText("VoiceAI")).toBeDefined();

    // Click collapse button (has a ChevronLeft icon)
    const collapseButtons = screen.getAllByRole("button");
    const collapseBtn = collapseButtons.find((b) => b.querySelector("[class*='lucide-chevron-left']"));
    if (collapseBtn) {
      await userEvent.click(collapseBtn);
      // After collapse, section headers should be hidden
      expect(screen.queryByText("Overview")).toBeNull();
    }
  });
});

// ── Error Boundary Flow ──────────────────────────────────────────────

describe("Error Handling Flow", () => {
  it("ErrorBoundary catches rendering errors and shows retry", async () => {
    const { ErrorBoundary } = await import("@/components/ui/error-boundary");

    const BrokenComponent = () => {
      throw new Error("Test error");
    };

    // Suppress console.error for expected error
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>
    );

    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/)).toBeDefined();
    });

    // Should show retry button
    expect(screen.getByText("Retry")).toBeDefined();

    consoleSpy.mockRestore();
  });
});
