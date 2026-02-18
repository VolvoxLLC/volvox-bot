import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { AnalyticsDashboard } from "@/components/dashboard/analytics-dashboard";
import { SELECTED_GUILD_KEY } from "@/lib/guild-selection";

vi.mock("recharts", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );

  return {
    ResponsiveContainer: Wrapper,
    LineChart: Wrapper,
    Line: () => null,
    BarChart: Wrapper,
    Bar: Wrapper,
    PieChart: Wrapper,
    Pie: Wrapper,
    Cell: () => null,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    Legend: () => null,
  };
});

const analyticsPayload = {
  guildId: "guild-1",
  range: {
    type: "week",
    from: "2026-02-10T00:00:00.000Z",
    to: "2026-02-17T23:59:59.999Z",
    interval: "day",
    channelId: null,
  },
  kpis: {
    totalMessages: 1234,
    aiRequests: 456,
    aiCostUsd: 1.2345,
    activeUsers: 88,
    newMembers: 7,
  },
  realtime: {
    onlineMembers: 12,
    activeAiConversations: 3,
  },
  messageVolume: [
    {
      bucket: "2026-02-15T00:00:00.000Z",
      label: "Feb 15",
      messages: 100,
      aiRequests: 20,
    },
  ],
  aiUsage: {
    byModel: [
      {
        model: "claude-sonnet-4-20250514",
        requests: 456,
        promptTokens: 90000,
        completionTokens: 45000,
        costUsd: 1.2345,
      },
    ],
    tokens: {
      prompt: 90000,
      completion: 45000,
    },
  },
  channelActivity: [
    {
      channelId: "channel-1",
      name: "general",
      messages: 500,
    },
  ],
  heatmap: [
    {
      dayOfWeek: 1,
      hour: 10,
      messages: 12,
    },
  ],
};

describe("AnalyticsDashboard", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows select server state when no guild is selected", () => {
    render(<AnalyticsDashboard />);

    expect(screen.getByText("Select a server")).toBeInTheDocument();
  });

  it("fetches analytics for selected guild and renders KPIs", async () => {
    localStorage.setItem(SELECTED_GUILD_KEY, "guild-1");

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(analyticsPayload),
    } as Response);

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    expect(screen.getByText("Total messages")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("456")).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();
  });

  it("applies channel filter and refetches with channelId query param", async () => {
    localStorage.setItem(SELECTED_GUILD_KEY, "guild-1");

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(analyticsPayload),
    } as Response);

    const user = userEvent.setup();
    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText("general")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "general" }));

    await waitFor(() => {
      const calledWithChannelFilter = fetchSpy.mock.calls.some(([url]) =>
        String(url).includes("channelId=channel-1"),
      );
      expect(calledWithChannelFilter).toBe(true);
    });
  });

  it("converts custom local date boundaries to UTC ISO values in query params", async () => {
    localStorage.setItem(SELECTED_GUILD_KEY, "guild-1");

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(analyticsPayload),
    } as Response);

    const user = userEvent.setup();
    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    await user.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("From date"), {
      target: { value: "2026-01-15" },
    });
    fireEvent.change(screen.getByLabelText("To date"), {
      target: { value: "2026-01-16" },
    });
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      const customCalls = fetchSpy.mock.calls.filter(([url]) =>
        String(url).includes("range=custom"),
      );
      expect(customCalls.length).toBeGreaterThan(0);

      const latestCustomCall = customCalls[customCalls.length - 1];
      const parsedUrl = new URL(String(latestCustomCall[0]), "http://localhost");
      expect(parsedUrl.searchParams.get("from")).toBe(
        new Date(2026, 0, 15, 0, 0, 0, 0).toISOString(),
      );
      expect(parsedUrl.searchParams.get("to")).toBe(
        new Date(2026, 0, 16, 23, 59, 59, 999).toISOString(),
      );
    });
  });

  it("omits interval query param for custom ranges", async () => {
    localStorage.setItem(SELECTED_GUILD_KEY, "guild-1");

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(analyticsPayload),
    } as Response);

    const user = userEvent.setup();
    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    await user.click(screen.getByRole("button", { name: "Custom" }));

    await waitFor(() => {
      const calledWithCustomNoInterval = fetchSpy.mock.calls.some(([url]) => {
        const requestUrl = String(url);
        return requestUrl.includes("range=custom") && !requestUrl.includes("interval=");
      });
      expect(calledWithCustomNoInterval).toBe(true);
    });
  });

  it("does not apply custom range when from date is after to date", async () => {
    localStorage.setItem(SELECTED_GUILD_KEY, "guild-1");

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(analyticsPayload),
    } as Response);

    const user = userEvent.setup();
    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    await user.click(screen.getByRole("button", { name: "Custom" }));

    const fromInput = screen.getByLabelText("From date");
    const toInput = screen.getByLabelText("To date");

    fireEvent.change(fromInput, { target: { value: "2026-02-20" } });
    fireEvent.change(toInput, { target: { value: "2026-02-10" } });

    await waitFor(() => {
      expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("range=custom"))).toBe(true);
    });

    const callCountBeforeApply = fetchSpy.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(fetchSpy).toHaveBeenCalledTimes(callCountBeforeApply);
  });
});
