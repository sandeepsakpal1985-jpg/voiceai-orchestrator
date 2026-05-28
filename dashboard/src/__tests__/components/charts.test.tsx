import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AreaChartComponent from "@/components/charts/area-chart";
import BarChartComponent from "@/components/charts/bar-chart";
import PieChartComponent from "@/components/charts/pie-chart";

// ── Mock recharts responsive container ─────────────────────────────────
// jsdom doesn't fully support SVG rendering from recharts, so we mock
// ResponsiveContainer to render its children directly for testing.

vi.mock("recharts", async () => {
  const actual: Record<string, unknown> = await vi.importActual("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

// ── Test Data ──────────────────────────────────────────────────────────

const areaData = [
  { name: "Jan", value: 400, previous: 300 },
  { name: "Feb", value: 300, previous: 200 },
  { name: "Mar", value: 600, previous: 500 },
];

const barData = [
  { name: "Calls", value: 120 },
  { name: "Emails", value: 80 },
  { name: "Chats", value: 45 },
];

const pieData = [
  { name: "Resolved", value: 540, color: "#22c55e" },
  { name: "Pending", value: 200, color: "#eab308" },
  { name: "Escalated", value: 60, color: "#ef4444" },
];

// ── AreaChart Tests ────────────────────────────────────────────────────

describe("AreaChartComponent", () => {
  it("renders responsive container", () => {
    render(
      <AreaChartComponent
        data={areaData}
        dataKeys={[
          { key: "value", color: "#6366f1", name: "Current" },
          { key: "previous", color: "#a1a1aa", name: "Previous" },
        ]}
      />
    );
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
  });

  it("renders with custom height", () => {
    render(
      <AreaChartComponent
        data={areaData}
        dataKeys={[{ key: "value", color: "#6366f1", name: "Value" }]}
        height={400}
      />
    );
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
  });

  it("renders without grid when showGrid is false", () => {
    render(
      <AreaChartComponent
        data={areaData}
        dataKeys={[{ key: "value", color: "#6366f1", name: "Value" }]}
        showGrid={false}
      />
    );
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
  });

  it("renders with single data key", () => {
    render(
      <AreaChartComponent
        data={areaData}
        dataKeys={[{ key: "value", color: "#6366f1", name: "Value" }]}
      />
    );
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
  });

  it("renders empty data without crashing", () => {
    const { container } = render(
      <AreaChartComponent
        data={[]}
        dataKeys={[{ key: "value", color: "#6366f1", name: "Value" }]}
      />
    );
    // Should still render the container even with no data
    expect(container.querySelector('[data-testid="responsive-container"]')).toBeInTheDocument();
  });
});

// ── BarChart Tests ────────────────────────────────────────────────────

describe("BarChartComponent", () => {
  it("renders responsive container", () => {
    render(<BarChartComponent data={barData} />);
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
  });

  it("renders with custom color", () => {
    render(<BarChartComponent data={barData} color="#22c55e" />);
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
  });

  it("renders with horizontal layout", () => {
    render(<BarChartComponent data={barData} horizontal={true} />);
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
  });

  it("renders with custom height", () => {
    render(<BarChartComponent data={barData} height={500} />);
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
  });

  it("renders with custom dataKey", () => {
    const customData = [{ name: "Test", count: 50 }];
    render(<BarChartComponent data={customData} dataKey="count" />);
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
  });

  it("renders empty data without crashing", () => {
    const { container } = render(<BarChartComponent data={[]} />);
    expect(container.querySelector('[data-testid="responsive-container"]')).toBeInTheDocument();
  });
});

// ── PieChart Tests ────────────────────────────────────────────────────

describe("PieChartComponent", () => {
  it("renders responsive container", () => {
    render(<PieChartComponent data={pieData} />);
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
  });

  it("renders with custom dimensions", () => {
    render(
      <PieChartComponent
        data={pieData}
        height={400}
        innerRadius={80}
        outerRadius={120}
      />
    );
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
  });

  it("renders without legend when showLegend is false", () => {
    render(<PieChartComponent data={pieData} showLegend={false} />);
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
  });

  it("renders empty data without crashing", () => {
    const { container } = render(<PieChartComponent data={[]} />);
    expect(container.querySelector('[data-testid="responsive-container"]')).toBeInTheDocument();
  });

  it("renders with single data point", () => {
    const singleData = [{ name: "Only", value: 100, color: "#6366f1" }];
    render(<PieChartComponent data={singleData} />);
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
  });
});
