import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatsCard from "@/components/dashboard/stats-card";
import { PhoneCall } from "lucide-react";

describe("StatsCard", () => {
  it("renders title and value", () => {
    render(<StatsCard title="Total Calls" value="1,234" icon={PhoneCall} />);
    expect(screen.getByText("Total Calls")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
  });

  it("renders with up trend and change percentage", () => {
    render(
      <StatsCard
        title="Revenue"
        value="$99.99"
        change={12.5}
        changeLabel="vs last month"
        icon={PhoneCall}
        trend="up"
      />
    );
    expect(screen.getByText("+12.5%")).toBeInTheDocument();
    expect(screen.getByText("vs last month")).toBeInTheDocument();
  });

  it("renders with down trend", () => {
    render(
      <StatsCard
        title="Cost"
        value="$0.042"
        change={-5.3}
        icon={PhoneCall}
        trend="down"
      />
    );
    expect(screen.getByText("-5.3%")).toBeInTheDocument();
  });

  it("renders with neutral trend", () => {
    render(
      <StatsCard
        title="Calls"
        value={500}
        change={0}
        icon={PhoneCall}
        trend="neutral"
      />
    );
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("renders without change data", () => {
    render(<StatsCard title="Duration" value="5m 30s" icon={PhoneCall} />);
    expect(screen.getByText("Duration")).toBeInTheDocument();
    expect(screen.getByText("5m 30s")).toBeInTheDocument();
  });

  it("handles number values", () => {
    render(<StatsCard title="Count" value={42} icon={PhoneCall} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });
});
