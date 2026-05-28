import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Sidebar from "@/components/dashboard/sidebar";

// ── Mocks ─────────────────────────────────────────────────────────────

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

// ── Tests ─────────────────────────────────────────────────────────────

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the logo and brand name", () => {
    render(<Sidebar />);
    expect(screen.getByText("VoiceAI")).toBeInTheDocument();
    expect(screen.getByLabelText("Go to dashboard")).toBeInTheDocument();
  });

  it("renders section headings", () => {
    render(<Sidebar />);
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Communications")).toBeInTheDocument();
    expect(screen.getByText("AI & Content")).toBeInTheDocument();
    expect(screen.getByText("Connections")).toBeInTheDocument();
    expect(screen.getByText("Operations")).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
  });

  it("renders all navigation links", () => {
    render(<Sidebar />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Voice Chat")).toBeInTheDocument();
    expect(screen.getByText("AI Agents")).toBeInTheDocument();
    expect(screen.getByText("Call Analytics")).toBeInTheDocument();
    expect(screen.getByText("Live Monitoring")).toBeInTheDocument();
    expect(screen.getByText("Call History")).toBeInTheDocument();
    expect(screen.getByText("Subscription")).toBeInTheDocument();
  });

  it("highlights the active page link", () => {
    render(<Sidebar />);
    const dashboardLink = screen.getByText("Dashboard").closest("a");
    expect(dashboardLink).toHaveAttribute("aria-current", "page");
  });

  it("does not highlight inactive links", () => {
    render(<Sidebar />);
    const voiceChatLink = screen.getByText("Voice Chat").closest("a");
    expect(voiceChatLink).not.toHaveAttribute("aria-current");
  });

  it("starts expanded by default", () => {
    render(<Sidebar />);
    expect(screen.getByText("VoiceAI")).toBeVisible();
    expect(screen.getByText("Dashboard")).toBeVisible();
    expect(screen.getByText("All systems operational")).toBeVisible();
  });

  it("collapses when the collapse button is clicked", () => {
    render(<Sidebar />);
    const collapseBtn = screen.getByLabelText("Collapse sidebar");
    fireEvent.click(collapseBtn);

    // Section headings and labels should be hidden
    expect(screen.queryByText("Overview")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("All systems operational")).not.toBeInTheDocument();

    // Logo should still show (but brand name hidden)
    expect(screen.getByLabelText("Go to dashboard")).toBeInTheDocument();
  });

  it("expands again when toggled after collapse", () => {
    render(<Sidebar />);
    const collapseBtn = screen.getByLabelText("Collapse sidebar");
    fireEvent.click(collapseBtn);

    // Button should now say expand
    const expandBtn = screen.getByLabelText("Expand sidebar");
    fireEvent.click(expandBtn);

    // Everything should be visible again
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("renders all navigation links with correct hrefs", () => {
    render(<Sidebar />);
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href")).filter(Boolean);
    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/dashboard/voice-chat");
    expect(hrefs).toContain("/dashboard/ai-agent");
    expect(hrefs).toContain("/dashboard/analytics");
    expect(hrefs).toContain("/dashboard/call-history");
    expect(hrefs).toContain("/dashboard/subscriptions");
    expect(hrefs).toContain("/dashboard/settings");
  });

  it("renders with accessible aria attributes", () => {
    render(<Sidebar />);
    expect(screen.getByLabelText("Main navigation")).toBeInTheDocument();
    expect(screen.getByLabelText("Sidebar navigation")).toBeInTheDocument();
  });

  it("renders status indicator when expanded", () => {
    render(<Sidebar />);
    expect(screen.getByText("All systems operational")).toBeInTheDocument();
  });

  it("renders ChevronLeft icon with correct rotation when collapsed", () => {
    render(<Sidebar />);
    const collapseBtn = screen.getByLabelText("Collapse sidebar");
    fireEvent.click(collapseBtn);

    // After collapse, the chevron icon should have rotated (rotate-180 class)
    const chevron = collapseBtn.querySelector("svg");
    expect(chevron?.classList.contains("rotate-180")).toBe(true);
  });
});
