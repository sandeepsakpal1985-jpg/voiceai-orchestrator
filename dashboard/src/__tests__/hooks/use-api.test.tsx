import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useApi, useApiMutation } from "@/hooks/use-api";

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useApi", () => {
  it("starts in loading state with a URL", () => {
    const { result } = renderHook(() => useApi("/api/test"));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("starts without loading when URL is null", () => {
    const { result } = renderHook(() => useApi(null));
    expect(result.current.loading).toBe(false);
  });

  it("fetches data successfully", async () => {
    const data = { message: "success" };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(data),
    });

    const { result } = renderHook(() => useApi("/api/test"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual(data);
    expect(result.current.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith("/api/test", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("handles fetch error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useApi("/api/test"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe("Network error");
  });

  it("handles HTTP error response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "Unauthorized" }),
    });

    const { result } = renderHook(() => useApi("/api/test"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Unauthorized");
  });

  it("aborts request on unmount", async () => {
    mockFetch.mockImplementation(
      () =>
        new Promise((_, reject) => {
          const error = new Error("The user aborted a request.");
          error.name = "AbortError";
          reject(error);
        })
    );

    const { result, unmount } = renderHook(() => useApi("/api/test"));
    unmount();

    // Should not set error state after unmount with AbortError
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.error).toBeNull();
  });

  it("refetches when url changes", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 2 }),
      });

    const { result, rerender } = renderHook((url: string | null) => useApi(url), {
      initialProps: "/api/first",
    });

    await waitFor(() => expect(result.current.data).toEqual({ id: 1 }));

    rerender("/api/second");

    await waitFor(() => expect(result.current.data).toEqual({ id: 2 }));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("provides refetch function", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ count: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ count: 2 }),
      });

    const { result } = renderHook(() => useApi("/api/test"));
    await waitFor(() => expect(result.current.data).toEqual({ count: 1 }));

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.data).toEqual({ count: 2 });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("useApiMutation", () => {
  it("performs POST mutation", async () => {
    const responseData = { id: "123" };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(responseData),
    });

    const { result } = renderHook(() => useApiMutation("/api/test"));

    let data;
    await act(async () => {
      data = await result.current.mutate("POST", { name: "test" });
    });

    expect(data).toEqual(responseData);
    expect(mockFetch).toHaveBeenCalledWith("/api/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ name: "test" }),
    });
  });

  it("handles mutation error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Mutation failed"));

    const { result } = renderHook(() => useApiMutation("/api/test"));

    await act(async () => {
      await result.current.mutate("POST");
    });

    expect(result.current.error).toBe("Mutation failed");
    expect(result.current.loading).toBe(false);
  });

  it("defaults to POST method", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(() => useApiMutation("/api/test"));

    await act(async () => {
      await result.current.mutate();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("sends PUT request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(() => useApiMutation("/api/test"));

    await act(async () => {
      await result.current.mutate("PUT", { key: "value" });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({ method: "PUT" })
    );
  });
});
