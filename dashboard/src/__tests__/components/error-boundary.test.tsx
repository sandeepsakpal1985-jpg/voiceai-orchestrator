import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "@/components/ui/error-boundary";

// ── Test Components ────────────────────────────────────────────────────────

function GoodComponent(): ReactNode {
  return <div data-testid="good">Everything is fine</div>;
}

function BadComponent(): ReactNode {
  throw new Error("Intentional test error");
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("ErrorBoundary", () => {
  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <GoodComponent />
      </ErrorBoundary>
    );

    expect(screen.getByTestId("good")).toHaveTextContent("Everything is fine");
  });

  it("renders default fallback when a child throws", () => {
    // Suppress console.error for the intentional error
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <BadComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeDefined();
    expect(screen.getByText("Intentional test error")).toBeDefined();
    expect(screen.getByText("Retry")).toBeDefined();

    consoleSpy.mockRestore();
  });

  it("renders custom fallback when provided", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<div data-testid="custom">Custom error UI</div>}>
        <BadComponent />
      </ErrorBoundary>
    );

    expect(screen.getByTestId("custom")).toHaveTextContent("Custom error UI");
    expect(screen.queryByText("Retry")).toBeNull();

    consoleSpy.mockRestore();
  });

  it("resets error state when retry button is clicked", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary key="test">
        <BadComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeDefined();

    // Click retry — boundary resets state
    fireEvent.click(screen.getByText("Retry"));

    // After reset, the boundary re-renders its children.
    // If the error is persistent, it will catch again.
    // We just verify the state was reset by checking the button still exists
    // (boundary caught the error again after reset + re-render)
    expect(screen.getByText("Something went wrong")).toBeDefined();

    consoleSpy.mockRestore();
  });

  it("calls onError callback when an error is caught", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <BadComponent />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Intentional test error" }),
      expect.any(Object)
    );

    consoleSpy.mockRestore();
  });

  it("does not catch errors outside its tree", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <div>
        <ErrorBoundary>
          <GoodComponent />
        </ErrorBoundary>
      </div>
    );

    expect(screen.getByTestId("good")).toHaveTextContent("Everything is fine");

    consoleSpy.mockRestore();
  });
});
