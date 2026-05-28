import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import Navbar from "@/components/dashboard/navbar";

// ── Mocks ─────────────────────────────────────────────────────────────

const mockSetTheme = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/dashboard",
}));

// We dynamically set the theme mock so each test can change it
let currentTheme = "light";
vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: currentTheme,
    setTheme: mockSetTheme,
  }),
}));

let currentSession: { data: { user: { name: string | null; email: string | null; image: string | null } } | null; status: string } = {
  data: {
    user: {
      name: "John Doe",
      email: "john@example.com",
      image: "https://example.com/avatar.jpg",
    },
  },
  status: "authenticated",
};

vi.mock("next-auth/react", () => ({
  useSession: () => currentSession,
}));

// ── Tests ─────────────────────────────────────────────────────────────

describe("Navbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentTheme = "light";
    currentSession = {
      data: {
        user: {
          name: "John Doe",
          email: "john@example.com",
          image: "https://example.com/avatar.jpg",
        },
      },
      status: "authenticated",
    };
  });

  it("renders the search input", () => {
    render(<Navbar />);
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Search calls, campaigns, contacts...")
    ).toBeInTheDocument();
  });

  it("renders the theme toggle button after mount", async () => {
    render(<Navbar />);
    // The theme button only renders after useEffect fires (mounted state)
    await waitFor(() => {
      expect(screen.getByLabelText("Switch to dark mode")).toBeInTheDocument();
    });
  });

  it("toggles theme when theme button is clicked", async () => {
    render(<Navbar />);
    await waitFor(() => {
      const themeBtn = screen.getByLabelText("Switch to dark mode");
      fireEvent.click(themeBtn);
      expect(mockSetTheme).toHaveBeenCalledWith("dark");
    });
  });

  it("renders notification bell with unread count", async () => {
    render(<Navbar />);
    await waitFor(() => {
      const notifBtn = screen.getByLabelText("Notifications (3 unread)");
      expect(notifBtn).toBeInTheDocument();
    });
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders user avatar with initials", async () => {
    render(<Navbar />);
    await waitFor(() => {
      // Should show "J" for "John Doe"
      expect(screen.getByText("J")).toBeInTheDocument();
    });
  });

  it("renders user avatar button", async () => {
    render(<Navbar />);
    await waitFor(() => {
      const userBtn = screen.getByLabelText("User menu");
      expect(userBtn).toBeInTheDocument();
    });
  });

  it("shows moon icon in light mode", async () => {
    render(<Navbar />);
    await waitFor(() => {
      const themeBtn = screen.getByLabelText("Switch to dark mode");
      // Lucide renders SVGs with specific attributes
      const svg = themeBtn.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });
  });

  it("shows sun icon in dark mode", async () => {
    currentTheme = "dark";
    render(<Navbar />);
    await waitFor(() => {
      expect(screen.getByLabelText("Switch to light mode")).toBeInTheDocument();
    });
  });

  it("renders user menu with session name", async () => {
    render(<Navbar />);
    await waitFor(() => {
      expect(screen.getByLabelText("User menu")).toBeInTheDocument();
    });
  });

  it("handles session without name gracefully", async () => {
    currentSession = {
      data: { user: { name: null, email: null, image: null } },
      status: "authenticated",
    };
    render(<Navbar />);
    await waitFor(() => {
      // Should show "U" as fallback initial
      expect(screen.getByText("U")).toBeInTheDocument();
    });
  });
});
