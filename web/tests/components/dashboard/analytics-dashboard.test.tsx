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
  topChannels: [
    {
      channelId: "channel-1",
      name: "general",
      messages: 500,
    },
  ],
  commandUsage: {
    source: "logs",
    items: [{ command: "help", uses: 42 }],
  },
  comparison: null,
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

  it("shows em dash for online members before initial load completes", async () => {
    localStorage.setItem(SELECTED_GUILD_KEY, "guild-1");
    vi.spyOn(global, "fetch").mockReturnValue(new Promise(() => {}));

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Online members")).toBeInTheDocument();
    });

    expect(screen.getByLabelText("Online members value")).toHaveTextContent(/^—$/);
  });

  it("shows em dash for active AI conversations before initial load completes", async () => {
    localStorage.setItem(SELECTED_GUILD_KEY, "guild-1");
    vi.spyOn(global, "fetch").mockReturnValue(new Promise(() => {}));

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Active AI conversations")).toBeInTheDocument();
    });

    expect(screen.getByLabelText("Active AI conversations value")).toHaveTextContent(/^—$/);
    expect(screen.getByLabelText("Active AI conversations value")).not.toHaveTextContent(/^0$/);
  });

  it("omits interval query param for custom range so server can auto-detect", async () => {
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
      const customCall = fetchSpy.mock.calls
        .map(([url]) => String(url))
        .find((url) => url.includes("range=custom"));
      expect(customCall).toBeDefined();
      expect(customCall).not.toContain("interval=");
    });
  });

  it("applies accessible scope attributes to heatmap table headers", async () => {
    localStorage.setItem(SELECTED_GUILD_KEY, "guild-1");

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(analyticsPayload),
    } as Response);

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Activity heatmap")).toBeInTheDocument();
    });

    expect(screen.getByRole("columnheader", { name: "Day" })).toHaveAttribute(
      "scope",
      "col",
    );
    expect(screen.getByRole("columnheader", { name: "0" })).toHaveAttribute(
      "scope",
      "col",
    );
    expect(screen.getByRole("rowheader", { name: "Sun" })).toHaveAttribute(
      "scope",
      "row",
    );
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

  it("shows a validation error and does not apply custom range when from date is after to date", async () => {
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

    expect(
      screen.getByText('"From" date must be on or before "To" date.'),
    ).toBeInTheDocument();

    const requestedInvalidRange = fetchSpy.mock.calls.some(([url]) => {
      const text = String(url);
      return (
        text.includes("range=custom") &&
        text.includes("from=2026-02-20T00%3A00%3A00.000Z") &&
        text.includes("to=2026-02-10T23%3A59%3A59.999Z")
      );
    });

    expect(fetchSpy).toHaveBeenCalledTimes(callCountBeforeApply);
    expect(requestedInvalidRange).toBe(false);
  });

  it("shows error card with retry button when API returns error", async () => {
    localStorage.setItem(SELECTED_GUILD_KEY, "guild-1");

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Internal server error" }),
    } as Response);

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load analytics/i)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("redirects to /login when API returns 401", async () => {
    localStorage.setItem(SELECTED_GUILD_KEY, "guild-1");

    const originalLocation = window.location;
    // @ts-expect-error -- mocking location
    delete window.location;
    // @ts-expect-error -- mocking location
    window.location = { href: "" };

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "Unauthorized" }),
    } as Response);

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(window.location.href).toBe("/login");
    });

    // @ts-expect-error -- restoring location mock
    window.location = originalLocation;
  });
  it("exports visible analytics data as CSV", async () => {
    localStorage.setItem(SELECTED_GUILD_KEY, "guild-1");

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(analyticsPayload),
    } as Response);

    const createObjectURLSpy = vi
      .spyOn(window.URL, "createObjectURL")
      .mockReturnValue("blob:analytics");
    const revokeObjectURLSpy = vi
      .spyOn(window.URL, "revokeObjectURL")
      .mockImplementation(() => undefined);

    const clickSpy = vi.fn();
    let createdAnchor: HTMLAnchorElement | null = null;
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === "a") {
        createdAnchor = element as HTMLAnchorElement;
        Object.defineProperty(element, "click", {
          value: clickSpy,
          configurable: true,
        });
      }
      return element;
    });

    const user = userEvent.setup();
    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /export csv/i })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: /export csv/i }));

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    const exportedBlob = createObjectURLSpy.mock.calls[0]?.[0] as Blob;
    expect(exportedBlob.type).toContain("text/csv");
    expect(createdAnchor?.download).toContain("analytics-guild-1");
    expect(createdAnchor?.href).toBe("blob:analytics");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:analytics");
  });


  it("includes compare query param when comparison mode is enabled", async () => {
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

  await user.click(screen.getByRole("button", { name: /compare vs previous/i }));

  await waitFor(() => {
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("compare=1"))).toBe(true);
  });
});

  it("renders command usage section", async () => {
    localStorage.setItem(SELECTED_GUILD_KEY, "guild-1");

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(analyticsPayload),
    } as Response);

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Command usage stats")).toBeInTheDocument();
    });

    expect(screen.getByText("/help")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });
});
