"use client";

import { useState, useEffect, useCallback } from "react";

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useApi<T>(url: string | null) {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: !!url,
    error: null,
  });

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!url) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setState({ data: json, loading: false, error: null });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setState({ data: null, loading: false, error: (err as Error).message });
    }
  }, [url]);

  useEffect(() => {
    const abortController = new AbortController();
    let cancelled = false;

    async function load() {
      if (!url) return;
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const res = await fetch(url, { signal: abortController.signal });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Request failed" }));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const json = await res.json();
        if (!cancelled) {
          setState({ data: json, loading: false, error: null });
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        if (!cancelled) {
          setState({ data: null, loading: false, error: (err as Error).message });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [url]);

  return { ...state, refetch: fetchData };
}

export function useApiMutation<T = unknown>(url: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (
      method: "POST" | "PUT" | "PATCH" | "DELETE" = "POST",
      body?: unknown
    ): Promise<T | null> => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Request failed" }));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const json = await res.json();
        setLoading(false);
        return json as T;
      } catch (err) {
        setError((err as Error).message);
        setLoading(false);
        return null;
      }
    },
    [url]
  );

  return { mutate, loading, error };
}
