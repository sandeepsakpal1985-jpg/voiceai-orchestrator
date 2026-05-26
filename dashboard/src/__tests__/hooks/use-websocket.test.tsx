import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useWebSocket } from "@/hooks/use-websocket";

// Collect mock WebSocket instances for test access
const mockWsInstances: MockWebSocket[] = [];
let closeCallCount = 0;

class MockWebSocket {
  url: string;
  readyState: number = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closeCalled = false;

  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url: string) {
    this.url = url;
    mockWsInstances.push(this);

    // Auto-open on next tick
    setTimeout(() => {
      if (this.readyState === MockWebSocket.CONNECTING) {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.();
      }
    }, 0);
  }

  send(_msg: string): void {
    void _msg; // noop
  }

  close(): void {
    if (this.closeCalled) return;
    this.closeCalled = true;
    closeCallCount++;
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1000, reason: "normal" });
  }

  // Test helper: simulate receiving a message
  _receive(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mockWsInstances.length = 0;
  closeCallCount = 0;
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockWsInstances.length = 0;
  closeCallCount = 0;
});

describe("useWebSocket", () => {
  it("transitions to connected state", async () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: "ws://localhost:3001" })
    );

    await waitFor(() => {
      expect(result.current.status).toBe("connected");
    });
  });

  it("receives parsed JSON data from the socket", async () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: "ws://localhost:3001", channels: ["live-monitoring"] })
    );

    await waitFor(() => {
      expect(result.current.status).toBe("connected");
    });

    const testData = {
      type: "live-monitoring",
      activeCalls: [],
      queueCount: 5,
    };

    act(() => {
      mockWsInstances[0]?._receive(testData);
    });

    expect(result.current.data).toEqual(testData);
    expect(result.current.lastUpdate).toBeTypeOf("number");
  });

  it("updates data on each new message", async () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: "ws://localhost:3001" })
    );

    await waitFor(() => {
      expect(result.current.status).toBe("connected");
    });

    const firstData = { value: 1 };
    const secondData = { value: 2 };

    act(() => {
      mockWsInstances[0]?._receive(firstData);
    });
    expect(result.current.data).toEqual(firstData);

    act(() => {
      mockWsInstances[0]?._receive(secondData);
    });
    expect(result.current.data).toEqual(secondData);
  });

  it("closes the WebSocket on unmount", async () => {
    const { unmount } = renderHook(() =>
      useWebSocket({ url: "ws://localhost:3001" })
    );

    await waitFor(() => {
      expect(mockWsInstances.length).toBe(1);
    });

    const beforeCount = closeCallCount;
    unmount();

    await waitFor(() => {
      expect(closeCallCount).toBeGreaterThan(beforeCount);
    });
  });

  it("handles connection error gracefully", async () => {
    // Override global WebSocket to trigger onerror
    vi.stubGlobal(
      "WebSocket",
      vi.fn().mockImplementation(() => {
        const ws = new MockWebSocket("ws://localhost:3001");
        setTimeout(() => {
          if (ws.readyState === MockWebSocket.CONNECTING) {
            ws.readyState = MockWebSocket.CLOSED;
            ws.onerror?.();
            ws.onclose?.({ code: 1006, reason: "connection failed" });
          }
        }, 0);
        return ws;
      })
    );

    const { result } = renderHook(() =>
      useWebSocket({ url: "ws://localhost:3001", reconnectInterval: 50 })
    );

    // Should eventually not be "connected"
    await waitFor(
      () => {
        expect(result.current.status).not.toBe("connected");
      },
      { timeout: 500 }
    );
  });

  it("does not crash with no options", () => {
    const { result } = renderHook(() => useWebSocket());
    // Hook should render without throwing
    expect(result.current).toBeDefined();
  });

  it("has null data before any message received", async () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: "ws://localhost:3001" })
    );

    await waitFor(() => {
      expect(result.current.status).toBe("connected");
    });

    expect(result.current.data).toBeNull();
  });
});
