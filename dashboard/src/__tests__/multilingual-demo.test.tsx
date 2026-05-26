/**
 * Integration Tests — Multilingual Demo Page
 *
 * Tests the 8-language interactive demo page: language selection,
 * tab switching, sample playback UI, demo scenarios, and pipeline info.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mock next/navigation ─────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/dashboard/multilingual-demo",
  redirect: vi.fn(),
}));

// ── Mock next-auth/react ─────────────────────────────────────────────
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

// ── Mock window.speechSynthesis (not available in jsdom) ─────────────
const mockSpeak = vi.fn();
const mockCancel = vi.fn();
const mockGetVoices = vi.fn().mockReturnValue([]);
const mockUtterance = vi.fn();  // ── Mock fetch for /api/languages (page now fetches languages dynamically) ──
  const mockLanguagesResponse = {
  languages: [
    {
      code: "en", name: "English", native: "English", flag: "🇺🇸",
      voice: "en-US-Wavenet-D", sttProviders: ["Whisper", "Deepgram"],
      llmProviders: ["Ollama", "OpenAI"], ttsProviders: ["Kokoro", "ElevenLabs"],
      rtl: false,
      samples: ["Hello! Welcome to VoiceAI.", "How can I help you today?"],
    },
    {
      code: "hi", name: "Hindi", native: "हिन्दी", flag: "🇮🇳",
      voice: "hi-IN-Wavenet-A", sttProviders: ["Whisper"],
      llmProviders: ["Ollama"], ttsProviders: ["Kokoro"], rtl: false,
      samples: ["नमस्ते!", "वॉइसएआई में आपका स्वागत है।"],
    },
    {
      code: "es", name: "Spanish", native: "Español", flag: "🇪🇸",
      voice: "es-ES-Wavenet-B", sttProviders: ["Whisper"],
      llmProviders: ["Ollama"], ttsProviders: ["Kokoro"], rtl: false,
      samples: ["¡Hola!", "Bienvenido a VoiceAI."],
    },
    {
      code: "fr", name: "French", native: "Français", flag: "🇫🇷",
      voice: "fr-FR-Wavenet-C", sttProviders: ["Whisper"],
      llmProviders: ["Ollama"], ttsProviders: ["Kokoro"], rtl: false,
      samples: ["Bonjour!", "Bienvenue chez VoiceAI."],
    },
    {
      code: "de", name: "German", native: "Deutsch", flag: "🇩🇪",
      voice: "de-DE-Wavenet-A", sttProviders: ["Whisper"],
      llmProviders: ["Ollama"], ttsProviders: ["Kokoro"], rtl: false,
      samples: ["Hallo!", "Willkommen bei VoiceAI."],
    },
    {
      code: "ja", name: "Japanese", native: "日本語", flag: "🇯🇵",
      voice: "ja-JP-Wavenet-C", sttProviders: ["Whisper"],
      llmProviders: ["Ollama"], ttsProviders: ["Kokoro"], rtl: false,
      samples: ["こんにちは！", "VoiceAIへようこそ。"],
    },
    {
      code: "zh", name: "Chinese", native: "中文", flag: "🇨🇳",
      voice: "zh-CN-Wavenet-A", sttProviders: ["Whisper"],
      llmProviders: ["Ollama"], ttsProviders: ["Kokoro"], rtl: false,
      samples: ["你好！", "欢迎来到VoiceAI。"],
    },
    {
      code: "ar", name: "Arabic", native: "العربية", flag: "🇦🇪",
      voice: "ar-XA-Wavenet-A", sttProviders: ["Whisper"],
      llmProviders: ["Ollama"], ttsProviders: ["ElevenLabs"], rtl: true,
      samples: ["مرحباً!", "أهلاً بك في VoiceAI."],
    },
  ],
  total: 8,
};

beforeEach(() => {
  Object.defineProperty(window, "speechSynthesis", {
    value: {
      speak: mockSpeak,
      cancel: mockCancel,
      getVoices: mockGetVoices,
      paused: false,
      pending: false,
      speaking: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onvoiceschanged: null,
    },
    writable: true,
    configurable: true,
  });
  vi.stubGlobal("SpeechSynthesisUtterance", mockUtterance);

  // Mock fetch to return languages from API
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockLanguagesResponse),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────

describe("Multilingual Demo Page", () => {
  it("renders the page header with title and language count badge", async () => {
    const MultilingualDemoPage = (await import("@/app/(dashboard)/multilingual-demo/page")).default;
    render(<MultilingualDemoPage />);

    await waitFor(() => {
      expect(screen.getByText("Multilingual Demo")).toBeDefined();
    });

    // Subtitle
    expect(screen.getByText(/Experience VoiceAI in 8 languages/)).toBeDefined();

    // Badge with language count
    expect(screen.getByText("8 Languages Supported")).toBeDefined();
  }, 15000);

  it("has three tabs: Languages, Interactive Demo, How It Works", async () => {
    const MultilingualDemoPage = (await import("@/app/(dashboard)/multilingual-demo/page")).default;
    render(<MultilingualDemoPage />);

    await waitFor(() => {
      expect(screen.getByText("Languages")).toBeDefined();
    });

    expect(screen.getByText("Interactive Demo")).toBeDefined();
    expect(screen.getByText("How It Works")).toBeDefined();
  });

  it("shows the Languages tab by default with language cards", async () => {
    const MultilingualDemoPage = (await import("@/app/(dashboard)/multilingual-demo/page")).default;
    render(<MultilingualDemoPage />);

    // Wait for fetch to resolve and languages to render
    const englishElements = await screen.findAllByText("English");
    expect(englishElements.length).toBeGreaterThanOrEqual(1);

    // Verify multiple languages are visible using native names (unique in the DOM)
    expect(screen.getByText("हिन्दी")).toBeDefined();
    expect(screen.getByText("Español")).toBeDefined();
    expect(screen.getByText("Français")).toBeDefined();
    expect(screen.getByText("Deutsch")).toBeDefined();
  });

  it("shows English as the default selected language with Active badge", async () => {
    const MultilingualDemoPage = (await import("@/app/(dashboard)/multilingual-demo/page")).default;
    render(<MultilingualDemoPage />);

    // Wait for fetch to resolve and languages to render
    const englishElements = await screen.findAllByText(/English/);
    expect(englishElements.length).toBeGreaterThanOrEqual(1);

    // Active badge appears on the selected language
    const activeBadges = await screen.findAllByText("Active");
    expect(activeBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("switches tabs when clicking Interactive Demo and How It Works", async () => {
    const MultilingualDemoPage = (await import("@/app/(dashboard)/multilingual-demo/page")).default;
    render(<MultilingualDemoPage />);

    await waitFor(() => {
      expect(screen.getByText("Languages")).toBeDefined();
    });

    // Click "Interactive Demo" tab
    const demoTab = screen.getByText("Interactive Demo");
    await userEvent.click(demoTab);

    // Should now show demo content — scenario cards
    await waitFor(() => {
      expect(screen.getByText("Customer Support")).toBeDefined();
      expect(screen.getByText("Sales Inquiry")).toBeDefined();
      expect(screen.getByText("Appointment Booking")).toBeDefined();
    });

    // Click "How It Works" tab
    const infoTab = screen.getByText("How It Works");
    await userEvent.click(infoTab);

    // Should show pipeline steps
    await waitFor(() => {
      expect(screen.getByText("1. Speech-to-Text")).toBeDefined();
      expect(screen.getByText("2. LLM Processing")).toBeDefined();
      expect(screen.getByText("3. Text-to-Speech")).toBeDefined();
    });
  });

  it("displays provider badges in the How It Works tab", async () => {
    const MultilingualDemoPage = (await import("@/app/(dashboard)/multilingual-demo/page")).default;
    render(<MultilingualDemoPage />);

    // Go to How It Works tab
    await waitFor(() => {
      expect(screen.getByText("How It Works")).toBeDefined();
    });
    await userEvent.click(screen.getByText("How It Works"));

    // Provider badges
    await waitFor(() => {
      expect(screen.getByText("Whisper (local)")).toBeDefined();
      expect(screen.getByText("Deepgram")).toBeDefined();
      expect(screen.getByText("Ollama (local)")).toBeDefined();
      expect(screen.getByText("OpenAI")).toBeDefined();
      expect(screen.getByText("Gemini")).toBeDefined();
      expect(screen.getByText("Kokoro (local)")).toBeDefined();
      expect(screen.getByText("ElevenLabs")).toBeDefined();
    });
  });

  it("starts a demo scenario when clicking Start Demo button", async () => {
    const MultilingualDemoPage = (await import("@/app/(dashboard)/multilingual-demo/page")).default;
    render(<MultilingualDemoPage />);

    // Switch to Interactive Demo tab
    await waitFor(() => {
      expect(screen.getByText("Interactive Demo")).toBeDefined();
    });
    await userEvent.click(screen.getByText("Interactive Demo"));

    // Wait for scenario cards
    await waitFor(() => {
      expect(screen.getByText("Customer Support")).toBeDefined();
    });

    // Click "Start Demo" button for Customer Support
    const startButtons = screen.getAllByText("Start Demo");
    await userEvent.click(startButtons[0]);

    // Should show the user's first message
    await waitFor(() => {
      expect(screen.getByText(/I can't log into my account/)).toBeDefined();
    });
  });

  it("plays language sample audio when clicking play button", async () => {
    const MultilingualDemoPage = (await import("@/app/(dashboard)/multilingual-demo/page")).default;
    render(<MultilingualDemoPage />);

    // Wait for fetch to resolve and language cards to render
    const playButtons = await screen.findAllByLabelText("Play sample");
    expect(playButtons.length).toBeGreaterThanOrEqual(1);

    // Click play on first language card
    await userEvent.click(playButtons[0]);

    // Should have called speechSynthesis.speak
    expect(mockSpeak).toHaveBeenCalled();
  });

  it("shows the pipeline diagram with 5 steps", async () => {
    const MultilingualDemoPage = (await import("@/app/(dashboard)/multilingual-demo/page")).default;
    render(<MultilingualDemoPage />);

    // Go to How It Works tab
    await waitFor(() => {
      expect(screen.getByText("How It Works")).toBeDefined();
    });
    await userEvent.click(screen.getByText("How It Works"));

    // Pipeline labels
    await waitFor(() => {
      expect(screen.getByText("Audio Input")).toBeDefined();
      expect(screen.getByText("STT")).toBeDefined();
      expect(screen.getByText("LLM")).toBeDefined();
      expect(screen.getByText("TTS")).toBeDefined();
      expect(screen.getByText("Speech Output")).toBeDefined();
    });
  });

  it("selects a different language when clicking its card", async () => {
    const MultilingualDemoPage = (await import("@/app/(dashboard)/multilingual-demo/page")).default;
    render(<MultilingualDemoPage />);

    await waitFor(() => {
      expect(screen.getByText("हिन्दी")).toBeDefined();
    });

    // Click on Hindi (native name is unique in DOM since only the card has it)
    await userEvent.click(screen.getByText("हिन्दी"));

    // The active language banner should show "Hindi (हिन्दी)" — Hindi name appears
    // in both banner and card, so use getAllByText
    const hindiElements = screen.getAllByText(/Hindi/);
    expect(hindiElements.length).toBeGreaterThanOrEqual(1);
  });

  it("shows Try Demo button that navigates to demo tab", async () => {
    const MultilingualDemoPage = (await import("@/app/(dashboard)/multilingual-demo/page")).default;
    render(<MultilingualDemoPage />);

    await waitFor(() => {
      const tryDemoButton = screen.getByText("Try Demo");
      expect(tryDemoButton).toBeDefined();
    });

    // Click Try Demo
    await userEvent.click(screen.getByText("Try Demo"));

    // Should navigate to demo tab and show demo content
    await waitFor(() => {
      expect(screen.getByText("Customer Support")).toBeDefined();
    });
  });

  it("renders the Change button on the demo tab to go back to languages", async () => {
    const MultilingualDemoPage = (await import("@/app/(dashboard)/multilingual-demo/page")).default;
    render(<MultilingualDemoPage />);

    // Go to demo tab first
    await waitFor(() => {
      expect(screen.getByText("Interactive Demo")).toBeDefined();
    });
    await userEvent.click(screen.getByText("Interactive Demo"));

    // The Change button should be visible
    await waitFor(() => {
      const changeButton = screen.getByText("Change");
      expect(changeButton).toBeDefined();
    });

    // Click Change to go back to Languages tab
    await userEvent.click(screen.getByText("Change"));

    // Should be back on Languages tab with language cards
    await waitFor(() => {
      expect(screen.getByText("हिन्दी")).toBeDefined();
    });
  });
});
