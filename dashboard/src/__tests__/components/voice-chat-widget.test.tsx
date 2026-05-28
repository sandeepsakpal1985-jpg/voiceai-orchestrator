import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { VoiceChatWidget } from "@/components/voice/voice-chat-widget";

// ── Mock livekit-client at module level ─────────────────────────────
// Use vi.hoisted() so the mockRoom is available when vi.mock factory runs

const { mockRoom } = vi.hoisted(() => {
  const room = {
    connect: vi.fn().mockImplementation(async () => {
      // Fire connectionStateChanged handler to simulate LiveKit connecting
      const handler = room.on.mock.calls.find(
        (call: string[]) => call[0] === "connectionStateChanged"
      )?.[1];
      if (handler) {
        handler("connected");
      }
    }),
    disconnect: vi.fn(),
    on: vi.fn(),
    localParticipant: {
      setMetadata: vi.fn().mockResolvedValue(undefined),
      publishTrack: vi.fn().mockResolvedValue(undefined),
    },
  };
  return { mockRoom: room };
});

vi.mock("livekit-client", () => ({
  Room: function() { return mockRoom; },
  RoomEvent: {
    TrackSubscribed: "trackSubscribed",
    TrackUnsubscribed: "trackUnsubscribed",
    Disconnected: "disconnected",
    ConnectionStateChanged: "connectionStateChanged",
  },
  ConnectionState: {
    Connected: "connected",
    Reconnecting: "reconnecting",
    Disconnected: "disconnected",
  },
  LocalParticipant: vi.fn(),
}));

// ── Global mocks for browser APIs ───────────────────────────────────

beforeEach(() => {
  // Clear all mock call history but preserve implementations
  vi.clearAllMocks();

  // Re-register the connect implementation after clearAllMocks resets it
  mockRoom.connect.mockImplementation(async () => {
    const handler = mockRoom.on.mock.calls.find(
      (call: string[]) => call[0] === "connectionStateChanged"
    )?.[1];
    if (handler) {
      handler("connected");
    }
  });

  // Mock scrollIntoView on all elements
  Element.prototype.scrollIntoView = vi.fn();

  // Mock navigator.mediaDevices
  const mockStream = {
    getAudioTracks: () => [{
      stop: vi.fn(),
      enabled: true,
    }],
    getTracks: () => [{ stop: vi.fn() }],
  };
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      getUserMedia: vi.fn().mockResolvedValue(mockStream),
    },
    configurable: true,
  });

  // Mock MediaRecorder
  class MockMediaRecorder {
    state = "inactive";
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; }
    static isTypeSupported(_type: string) { return true; }
  }
  Object.defineProperty(window, "MediaRecorder", {
    value: MockMediaRecorder,
    configurable: true,
  });

  // Mock AudioContext
  class MockAudioContext {
    createMediaStreamSource() {
      return { connect: vi.fn() };
    }
    createAnalyser() {
      return {
        fftSize: 256,
        frequencyBinCount: 128,
        getByteFrequencyData: vi.fn(),
        connect: vi.fn(),
      };
    }
    close() { return Promise.resolve(); }
  }
  Object.defineProperty(window, "AudioContext", {
    value: MockAudioContext,
    configurable: true,
  });

  // Mock WebSocket
  class MockWebSocket {
    readyState = 1;
    onopen: (() => void) | null = null;
    onclose: ((e: { code: number; reason: string }) => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onerror: ((e: Event) => void) | null = null;
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(_url: string) {
      setTimeout(() => this.onopen?.(), 0);
    }

    send(_data: unknown) {}
    close() {
      this.onclose?.({ code: 1000, reason: "closed" });
    }
  }
  Object.defineProperty(window, "WebSocket", {
    value: MockWebSocket as any,
    configurable: true,
  });

  // Mock fetch
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      token: "mock-livekit-token",
      room_name: "voiceai-test-room",
      url: "ws://localhost:7880",
    }),
  });

  // Mock Audio
  class MockAudio {
    play() { return Promise.resolve(); }
    pause() {}
  }
  Object.defineProperty(window, "Audio", {
    value: MockAudio as any,
    configurable: true,
  });

  // Mock URL utilities
  URL.createObjectURL = vi.fn(() => "blob:mock-url");
  URL.revokeObjectURL = vi.fn();
});

// ── Tests ─────────────────────────────────────────────────────────────

describe("VoiceChatWidget", () => {
  it("renders in idle state with start call button", () => {
    render(<VoiceChatWidget />);
    expect(screen.getByText("Ready to call")).toBeInTheDocument();
    expect(screen.getByText(/Click .Start Call. to begin/)).toBeInTheDocument();
  });

  it("renders with default transport mode", () => {
    render(<VoiceChatWidget />);
    expect(screen.getByText("Ready to call")).toBeInTheDocument();
  });

  it("renders with websocket transport mode", () => {
    render(<VoiceChatWidget transport="websocket" />);
    expect(screen.getByText("Ready to call")).toBeInTheDocument();
  });

  it("renders custom WS URL", () => {
    render(<VoiceChatWidget wsUrl="ws://custom:8000/ws/voice" />);
    expect(screen.getByText("Ready to call")).toBeInTheDocument();
  });

  it("shows connecting then connected state on start call", async () => {
    render(<VoiceChatWidget />);

    const buttons = document.querySelectorAll("button");
    const startBtn = Array.from(buttons).find(
      (b) => b.classList.contains("bg-emerald-600")
    );
    expect(startBtn).toBeTruthy();
    if (startBtn) fireEvent.click(startBtn);

    // Should show "Connecting..." immediately (sync state update)
    expect(screen.getByText("Connecting...")).toBeInTheDocument();

    // The mock connect() auto-fires connectionStateChanged → status becomes "Connected"
    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("shows error when microphone access is denied", async () => {
    // Override getUserMedia to reject with a DOMException
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockRejectedValue(
          new DOMException("Permission denied", "NotAllowedError")
        ),
      },
      configurable: true,
    });

    render(<VoiceChatWidget />);
    const buttons = document.querySelectorAll("button");
    const startBtn = Array.from(buttons).find(
      (b) => b.classList.contains("bg-emerald-600")
    );
    if (startBtn) fireEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByText(/Microphone access denied/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("calls onStatusChange when connection status changes", async () => {
    const onStatusChange = vi.fn();
    render(<VoiceChatWidget onStatusChange={onStatusChange} />);

    const buttons = document.querySelectorAll("button");
    const startBtn = Array.from(buttons).find(
      (b) => b.classList.contains("bg-emerald-600")
    );
    if (startBtn) fireEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    }, { timeout: 5000 });

    expect(onStatusChange).toHaveBeenCalledWith("connecting");
    expect(onStatusChange).toHaveBeenCalledWith("connected");
  });

  it("calls onMessage with welcome message on connect", async () => {
    const onMessage = vi.fn();
    render(<VoiceChatWidget onMessage={onMessage} />);

    const buttons = document.querySelectorAll("button");
    const startBtn = Array.from(buttons).find(
      (b) => b.classList.contains("bg-emerald-600")
    );
    if (startBtn) fireEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    }, { timeout: 5000 });

    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "agent",
        content: expect.stringContaining("Connected via LiveKit"),
      })
    );
  });

  it("renders with system prompt", () => {
    render(<VoiceChatWidget systemPrompt="You are a helpful assistant" />);
    expect(screen.getByText("Ready to call")).toBeInTheDocument();
  });

  it("renders with custom voice ID", () => {
    render(<VoiceChatWidget voiceId="af_sky" />);
    expect(screen.getByText("Ready to call")).toBeInTheDocument();
  });

  it("renders with custom LiveKit URL", () => {
    render(<VoiceChatWidget livekitUrl="ws://livekit.custom:7880" />);
    expect(screen.getByText("Ready to call")).toBeInTheDocument();
  });
});
